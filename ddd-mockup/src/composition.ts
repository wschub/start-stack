import { PrismaPg } from "@prisma/adapter-pg";
import pino from "pino";
import { createApp } from "./app.ts";
import type { Env } from "./config/env.ts";
import { PrismaClient } from "./generated/prisma/client.ts";
import { AuthenticateUser } from "./contexts/identity/application/commands/authenticate-user.command.ts";
import { IssueSession } from "./contexts/identity/application/commands/issue-session.command.ts";
import type { PasswordResetNotifier } from "./contexts/identity/application/ports/password-reset-notifier.ts";
import { PurgeExpiredPasswordResets } from "./contexts/identity/application/commands/purge-expired-password-resets.command.ts";
import { PurgeExpiredRefreshTokens } from "./contexts/identity/application/commands/purge-expired-refresh-tokens.command.ts";
import { RefreshSession } from "./contexts/identity/application/commands/refresh-session.command.ts";
import { RegisterUser } from "./contexts/identity/application/commands/register-user.command.ts";
import { RequestPasswordReset } from "./contexts/identity/application/commands/request-password-reset.command.ts";
import { ResetPassword } from "./contexts/identity/application/commands/reset-password.command.ts";
import { RevokeSession } from "./contexts/identity/application/commands/revoke-session.command.ts";
import { PrismaPasswordResetRepository } from "./contexts/identity/infrastructure/database/prisma-password-reset.repository.ts";
import { PrismaRefreshTokenRepository } from "./contexts/identity/infrastructure/database/prisma-refresh-token.repository.ts";
import { LogPasswordResetNotifier } from "./contexts/identity/infrastructure/notifications/log-password-reset-notifier.ts";
import { Argon2PasswordHasher } from "./contexts/identity/infrastructure/security/argon2-password-hasher.ts";
import { JoseAccessTokenService } from "./contexts/identity/infrastructure/security/jose-access-token-service.ts";
import { createAuthRouter } from "./contexts/identity/presentation/routes/auth.routes.ts";
import { createPasswordRouter } from "./contexts/identity/presentation/routes/password.routes.ts";
import { createSessionRouter } from "./contexts/identity/presentation/routes/session.routes.ts";
import { PrismaReadinessProbe } from "./platform/health/infrastructure/database/prisma-readiness-probe.ts";
import { PrismaUserRepository } from "./contexts/identity/infrastructure/database/prisma-user.repository.ts";
import { AUTH_PERMISSIONS } from "./contexts/identity/application/auth-permissions.ts";
import { AssignUserRoles } from "./contexts/identity/application/commands/assign-user-roles.command.ts";
import { CreateSuperAdmin } from "./contexts/identity/application/commands/create-super-admin.command.ts";
import { GetUserAccess } from "./contexts/identity/application/queries/get-user-access.query.ts";
import { ManageRoles } from "./contexts/identity/application/commands/manage-roles.command.ts";
import { ProtectSuperAdmins } from "./contexts/identity/application/commands/protect-super-admins.command.ts";
import { PrismaRoleRepository } from "./contexts/identity/infrastructure/database/prisma-role.repository.ts";
import {
  authenticatedUser,
  requireAuth,
} from "./contexts/identity/presentation/middlewares/require-auth.ts";
import { createPermissionGuard } from "./contexts/identity/presentation/middlewares/require-permission.ts";
import { createRolesRouter } from "./contexts/identity/presentation/routes/roles.routes.ts";
import { USERS_PERMISSIONS } from "./contexts/identity/application/users-permissions.ts";
import { ChangeUserStatus } from "./contexts/identity/application/commands/change-user-status.command.ts";
import { GetUser } from "./contexts/identity/application/queries/get-user.query.ts";
import { ListUsers } from "./contexts/identity/application/queries/list-users.query.ts";
import { createUsersRouter } from "./contexts/identity/presentation/routes/users.routes.ts";
import { InProcessEventBus } from "./shared/events/event-bus.ts";
import { PermissionRegistry } from "./shared/permissions/permission.ts";
import { subscribeIdentityEventHandlers } from "./contexts/identity/application/event-handlers/subscribe.ts";

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

  // Los repositorios publican en este bus los eventos de los agregados que guardan.
  const events = new InProcessEventBus();
  const users = new PrismaUserRepository(prisma, events);
  const refreshTokens = new PrismaRefreshTokenRepository(prisma);
  const passwordResets = new PrismaPasswordResetRepository(prisma, events);
  const hasher = new Argon2PasswordHasher();
  const accessTokens = new JoseAccessTokenService({
    secret: env.JWT_ACCESS_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    ttlSeconds: env.ACCESS_TOKEN_EXPIRATION_TIME,
  });

  // Catálogo de permisos: cada módulo declara los suyos y aquí se reúnen. Un módulo nuevo solo
  // tiene que añadir su lista para que aparezca en la gestión de roles.
  const permissions = new PermissionRegistry([...AUTH_PERMISSIONS, ...USERS_PERMISSIONS]);
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

  subscribeIdentityEventHandlers(events, {
    // Adaptador de desarrollo: escribe el enlace o el código en el log. Sustitúyelo por uno
    // que envíe correo antes de salir a producción (allí no revela nada).
    notifier:
      overrides.passwordResetNotifier ??
      new LogPasswordResetNotifier({
        logger,
        resetUrl: env.PASSWORD_RESET_URL,
        revealSecret: env.NODE_ENV !== "production",
      }),
    refreshTokens,
  });

  const passwordRouter = createPasswordRouter({
    requestPasswordReset: new RequestPasswordReset({
      users,
      resets: passwordResets,
      linkTtlSeconds: env.PASSWORD_RESET_EXPIRATION_TIME,
      codeTtlSeconds: Math.min(env.PASSWORD_RESET_EXPIRATION_TIME, MAX_RESET_CODE_SECONDS),
    }),
    resetPassword: new ResetPassword({ users, resets: passwordResets, hasher }),
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
