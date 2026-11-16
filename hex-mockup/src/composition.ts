import { PrismaPg } from "@prisma/adapter-pg";
import pino from "pino";
import { createApp } from "./app.ts";
import type { Env } from "./config/env.ts";
import { PrismaClient } from "./generated/prisma/client.ts";
import { AuthenticateUser } from "./modules/auth/application/use-cases/authenticate-user.use-case.ts";
import { IssueSession } from "./modules/auth/application/use-cases/issue-session.use-case.ts";
import type { PasswordResetNotifier } from "./modules/auth/application/ports/password-reset-notifier.ts";
import { PurgeExpiredPasswordResets } from "./modules/auth/application/use-cases/purge-expired-password-resets.use-case.ts";
import { PurgeExpiredRefreshTokens } from "./modules/auth/application/use-cases/purge-expired-refresh-tokens.use-case.ts";
import { RefreshSession } from "./modules/auth/application/use-cases/refresh-session.use-case.ts";
import { RegisterUser } from "./modules/auth/application/use-cases/register-user.use-case.ts";
import { RequestPasswordReset } from "./modules/auth/application/use-cases/request-password-reset.use-case.ts";
import { ResetPassword } from "./modules/auth/application/use-cases/reset-password.use-case.ts";
import { RevokeSession } from "./modules/auth/application/use-cases/revoke-session.use-case.ts";
import { PrismaPasswordResetRepository } from "./modules/auth/infrastructure/database/prisma-password-reset.repository.ts";
import { PrismaRefreshTokenRepository } from "./modules/auth/infrastructure/database/prisma-refresh-token.repository.ts";
import { LogPasswordResetNotifier } from "./modules/auth/infrastructure/notifications/log-password-reset-notifier.ts";
import { Argon2PasswordHasher } from "./modules/auth/infrastructure/security/argon2-password-hasher.ts";
import { JoseAccessTokenService } from "./modules/auth/infrastructure/security/jose-access-token-service.ts";
import { createAuthRouter } from "./modules/auth/presentation/routes/auth.routes.ts";
import { createPasswordRouter } from "./modules/auth/presentation/routes/password.routes.ts";
import { createSessionRouter } from "./modules/auth/presentation/routes/session.routes.ts";
import { PrismaReadinessProbe } from "./modules/health/infrastructure/database/prisma-readiness-probe.ts";
import { PrismaUserRepository } from "./modules/users/infrastructure/database/prisma-user.repository.ts";
import { AUTH_PERMISSIONS } from "./modules/auth/application/permissions.ts";
import { AssignUserRoles } from "./modules/auth/application/use-cases/assign-user-roles.use-case.ts";
import { CreateSuperAdmin } from "./modules/auth/application/use-cases/create-super-admin.use-case.ts";
import { GetUserAccess } from "./modules/auth/application/use-cases/get-user-access.use-case.ts";
import { ManageRoles } from "./modules/auth/application/use-cases/manage-roles.use-case.ts";
import { ProtectSuperAdmins } from "./modules/auth/application/use-cases/protect-super-admins.use-case.ts";
import { PrismaRoleRepository } from "./modules/auth/infrastructure/database/prisma-role.repository.ts";
import {
  authenticatedUser,
  requireAuth,
} from "./modules/auth/presentation/middlewares/require-auth.ts";
import { createPermissionGuard } from "./modules/auth/presentation/middlewares/require-permission.ts";
import { createRolesRouter } from "./modules/auth/presentation/routes/roles.routes.ts";
import { USERS_PERMISSIONS } from "./modules/users/application/permissions.ts";
import { ChangeUserStatus } from "./modules/users/application/use-cases/change-user-status.use-case.ts";
import { GetUser } from "./modules/users/application/use-cases/get-user.use-case.ts";
import { ListUsers } from "./modules/users/application/use-cases/list-users.use-case.ts";
import { createUsersRouter } from "./modules/users/presentation/routes/users.routes.ts";
import { PermissionRegistry } from "./shared/permissions/permission.ts";
// start-stack:imports

/** El código de 6 dígitos caduca antes que el enlace: es más fácil de adivinar. */
const MAX_RESET_CODE_SECONDS = 10 * 60;

/** Raíz de composición: el único lugar donde se conectan los adaptadores con los casos de uso. */
export interface CompositionOverrides {
  /** Sustituye al adaptador que escribe en el log (por ejemplo, por uno que envíe correo). */
  passwordResetNotifier?: PasswordResetNotifier;
}

export function composeApp(env: Env, overrides: CompositionOverrides = {}) {
  const logger = pino({ level: env.LOG_LEVEL });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  const users = new PrismaUserRepository(prisma);
  const refreshTokens = new PrismaRefreshTokenRepository(prisma);
  const passwordResets = new PrismaPasswordResetRepository(prisma);
  const hasher = new Argon2PasswordHasher();
  const accessTokens = new JoseAccessTokenService({
    secret: env.JWT_ACCESS_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    ttlSeconds: env.ACCESS_TOKEN_EXPIRATION_TIME,
  });

  // Catálogo de permisos: cada módulo declara los suyos y aquí se reúnen. Un módulo nuevo solo
  // tiene que añadir su lista para que aparezca en la gestión de roles.
  const permissions = new PermissionRegistry([
    ...AUTH_PERMISSIONS,
    ...USERS_PERMISSIONS,
    // start-stack:permissions
  ]);
  const roles = new PrismaRoleRepository(prisma);
  const getUserAccess = new GetUserAccess({ roles, registry: permissions });
  const authenticate = requireAuth({ accessTokens, users });
  const authorize = createPermissionGuard({ registry: permissions, getUserAccess });

  const issueSession = new IssueSession({
    tokens: refreshTokens,
    accessTokens,
    refreshTtlSeconds: env.REFRESH_TOKEN_EXPIRATION_TIME,
  });
  const refreshCookie = {
    secure: env.NODE_ENV === "production",
    sameSite: env.COOKIE_SAME_SITE,
  } as const;

  const authRouter = createAuthRouter({
    registerUser: new RegisterUser({ users, hasher }),
    authenticateUser: new AuthenticateUser({ users, hasher }),
    issueSession,
    getUserAccess,
    accessTokens,
    users,
    publicRegistration: env.PUBLIC_REGISTRATION,
    refreshCookie,
  });
  const sessionRouter = createSessionRouter({
    refreshSession: new RefreshSession({ tokens: refreshTokens, users, issueSession }),
    revokeSession: new RevokeSession({ tokens: refreshTokens }),
    refreshCookie,
    allowedOrigins: env.CORS_ORIGINS,
  });

  const passwordRouter = createPasswordRouter({
    requestPasswordReset: new RequestPasswordReset({
      users,
      resets: passwordResets,
      // Adaptador de desarrollo: escribe el enlace o el código en el log. Sustitúyelo por uno
      // que envíe correo antes de salir a producción (allí no revela nada).
      notifier:
        overrides.passwordResetNotifier ??
        new LogPasswordResetNotifier({
          logger,
          resetUrl: env.PASSWORD_RESET_URL,
          revealSecret: env.NODE_ENV !== "production",
        }),
      linkTtlSeconds: env.PASSWORD_RESET_EXPIRATION_TIME,
      codeTtlSeconds: Math.min(env.PASSWORD_RESET_EXPIRATION_TIME, MAX_RESET_CODE_SECONDS),
    }),
    resetPassword: new ResetPassword({ users, resets: passwordResets, refreshTokens, hasher }),
  });

  const rolesRouter = createRolesRouter({
    authenticate,
    authorize,
    registry: permissions,
    manageRoles: new ManageRoles({ roles, registry: permissions }),
    getUserAccess,
    assignUserRoles: new AssignUserRoles({ users, roles, getUserAccess }),
    users,
  });
  const usersRouter = createUsersRouter({
    authenticate,
    authorize,
    currentUserId: (res) => authenticatedUser(res).publicId,
    listUsers: new ListUsers({ users }),
    getUser: new GetUser({ users }),
    changeUserStatus: new ChangeUserStatus({
      users,
      guard: new ProtectSuperAdmins({ getUserAccess }),
    }),
  });

  // start-stack:wiring

  const app = createApp({
    readinessProbes: [new PrismaReadinessProbe(prisma)],
    routers: [
      authRouter,
      sessionRouter,
      passwordRouter,
      rolesRouter,
      usersRouter,
      // start-stack:routers
    ],
    corsOrigins: env.CORS_ORIGINS,
    trustProxy: env.TRUST_PROXY,
    logger,
  });

  return {
    app,
    logger,
    shutdown: () => prisma.$disconnect(),
    purgeExpiredTokens: new PurgeExpiredRefreshTokens({ tokens: refreshTokens }),
    createSuperAdmin: new CreateSuperAdmin({ users, roles, hasher }),
    purgeExpiredPasswordResets: new PurgeExpiredPasswordResets({ resets: passwordResets }),
  };
}
