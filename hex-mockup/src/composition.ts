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

  const app = createApp({
    readinessProbes: [new PrismaReadinessProbe(prisma)],
    routers: [authRouter, sessionRouter, passwordRouter],
    corsOrigins: env.CORS_ORIGINS,
    trustProxy: env.TRUST_PROXY,
    logger,
  });

  return {
    app,
    logger,
    shutdown: () => prisma.$disconnect(),
    purgeExpiredTokens: new PurgeExpiredRefreshTokens({ tokens: refreshTokens }),
    purgeExpiredPasswordResets: new PurgeExpiredPasswordResets({ resets: passwordResets }),
  };
}
