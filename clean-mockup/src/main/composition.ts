import { PrismaPg } from "@prisma/adapter-pg";
import pino from "pino";
import { createApp } from "../frameworks/express/app.ts";
import type { Env } from "./config/env.ts";
import { PrismaClient } from "../generated/prisma/client.ts";
import { AuthenticateUser } from "../use-cases/auth/authenticate-user.use-case.ts";
import { IssueSession } from "../use-cases/auth/issue-session.use-case.ts";
import type { PasswordResetNotifier } from "../use-cases/auth/ports/password-reset-notifier.ts";
import { PurgeExpiredPasswordResets } from "../use-cases/auth/purge-expired-password-resets.use-case.ts";
import { PurgeExpiredRefreshTokens } from "../use-cases/auth/purge-expired-refresh-tokens.use-case.ts";
import { RefreshSession } from "../use-cases/auth/refresh-session.use-case.ts";
import { RegisterUser } from "../use-cases/auth/register-user.use-case.ts";
import { RequestPasswordReset } from "../use-cases/auth/request-password-reset.use-case.ts";
import { ResetPassword } from "../use-cases/auth/reset-password.use-case.ts";
import { RevokeSession } from "../use-cases/auth/revoke-session.use-case.ts";
import { PrismaPasswordResetRepository } from "../frameworks/database/prisma-password-reset.repository.ts";
import { PrismaRefreshTokenRepository } from "../frameworks/database/prisma-refresh-token.repository.ts";
import { LogPasswordResetNotifier } from "../frameworks/notifications/log-password-reset-notifier.ts";
import { Argon2PasswordHasher } from "../frameworks/security/argon2-password-hasher.ts";
import { JoseAccessTokenService } from "../frameworks/security/jose-access-token-service.ts";
import { createAuthRouter } from "../frameworks/express/routes/auth.routes.ts";
import { createPasswordRouter } from "../frameworks/express/routes/password.routes.ts";
import { createSessionRouter } from "../frameworks/express/routes/session.routes.ts";
import { PrismaReadinessProbe } from "../frameworks/database/prisma-readiness-probe.ts";
import { PrismaUserRepository } from "../frameworks/database/prisma-user.repository.ts";
import { AUTH_PERMISSIONS } from "../use-cases/auth/permissions.ts";
import { AssignUserRoles } from "../use-cases/auth/assign-user-roles.use-case.ts";
import { CreateSuperAdmin } from "../use-cases/auth/create-super-admin.use-case.ts";
import { GetUserAccess } from "../use-cases/auth/get-user-access.use-case.ts";
import { CheckPermission } from "../use-cases/auth/check-permission.use-case.ts";
import { CreateRole } from "../use-cases/auth/create-role.use-case.ts";
import { DeleteRole } from "../use-cases/auth/delete-role.use-case.ts";
import { GetRole } from "../use-cases/auth/get-role.use-case.ts";
import { IdentifyUser } from "../use-cases/auth/identify-user.use-case.ts";
import { ListPermissions } from "../use-cases/auth/list-permissions.use-case.ts";
import { ListRoles } from "../use-cases/auth/list-roles.use-case.ts";
import { UpdateRole } from "../use-cases/auth/update-role.use-case.ts";
import { ProtectSuperAdmins } from "../use-cases/auth/protect-super-admins.use-case.ts";
import { PrismaRoleRepository } from "../frameworks/database/prisma-role.repository.ts";
import { requireAuth } from "../frameworks/express/middlewares/require-auth.ts";
import { createPermissionGuard } from "../frameworks/express/middlewares/require-permission.ts";
import { createRolesRouter } from "../frameworks/express/routes/roles.routes.ts";
import { USERS_PERMISSIONS } from "../use-cases/users/permissions.ts";
import { ChangeUserStatus } from "../use-cases/users/change-user-status.use-case.ts";
import { GetUser } from "../use-cases/users/get-user.use-case.ts";
import { ListUsers } from "../use-cases/users/list-users.use-case.ts";
import { createUsersRouter } from "../frameworks/express/routes/users.routes.ts";
import { PermissionRegistry } from "../use-cases/permissions/permission.ts";

/** El código de 6 dígitos caduca antes que el enlace: es más fácil de adivinar. */
const MAX_RESET_CODE_SECONDS = 10 * 60;

export interface CompositionOverrides {
  /** Sustituye al adaptador que escribe en el log (por ejemplo, por uno que envíe correo). */
  passwordResetNotifier?: PasswordResetNotifier;
}

/**
 * Raíz de composición: el único lugar que conoce todas las capas. Crea los detalles (base de
 * datos, criptografía, log), se los entrega a los casos de uso a través de sus puertos y monta
 * los controladores sobre Express.
 */
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

  // Catálogo de permisos: cada funcionalidad declara los suyos y aquí se reúnen. Una nueva solo
  // tiene que añadir su lista para que aparezca en la gestión de roles.
  const permissions = new PermissionRegistry([...AUTH_PERMISSIONS, ...USERS_PERMISSIONS]);
  const roles = new PrismaRoleRepository(prisma);
  const getUserAccess = new GetUserAccess({ roles, registry: permissions });
  const getUser = new GetUser({ users });
  const authenticate = requireAuth({ identifyUser: new IdentifyUser({ accessTokens, users }) });
  const authorize = createPermissionGuard({
    checkPermission: new CheckPermission({ registry: permissions, getUserAccess }),
  });

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
    authenticate,
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
    listPermissions: new ListPermissions({ registry: permissions }),
    listRoles: new ListRoles({ roles, registry: permissions }),
    getRole: new GetRole({ roles, registry: permissions }),
    createRole: new CreateRole({ roles, registry: permissions }),
    updateRole: new UpdateRole({ roles, registry: permissions }),
    deleteRole: new DeleteRole({ roles }),
    getUser,
    getUserAccess,
    assignUserRoles: new AssignUserRoles({ users, roles, getUserAccess }),
  });
  const usersRouter = createUsersRouter({
    authenticate,
    authorize,
    listUsers: new ListUsers({ users }),
    getUser,
    changeUserStatus: new ChangeUserStatus({
      users,
      guard: new ProtectSuperAdmins({ getUserAccess }),
    }),
  });

  const app = createApp({
    readinessProbes: [new PrismaReadinessProbe(prisma)],
    routers: [authRouter, sessionRouter, passwordRouter, rolesRouter, usersRouter],
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
