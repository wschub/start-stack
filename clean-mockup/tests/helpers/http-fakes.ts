import type { RequestHandler } from "express";
import { requireAuth } from "../../src/frameworks/express/middlewares/require-auth.ts";
import {
  createPermissionGuard,
  type PermissionGuard,
} from "../../src/frameworks/express/middlewares/require-permission.ts";
import { CheckPermission } from "../../src/use-cases/auth/check-permission.use-case.ts";
import type { UserAccess } from "../../src/use-cases/auth/get-user-access.use-case.ts";
import { IdentifyUser } from "../../src/use-cases/auth/identify-user.use-case.ts";
import type { AccessTokenService } from "../../src/use-cases/auth/ports/access-token-service.ts";
import type { PermissionRegistry } from "../../src/use-cases/permissions/permission.ts";
import type { UseCase } from "../../src/use-cases/use-case.ts";
import type { UserRepository } from "../../src/use-cases/users/ports/user.repository.ts";
import { FakeAccessTokenService } from "./session-fakes.ts";

/** Middleware de autenticación real, montado sobre los dobles que se le pasen. */
export function testAuthenticate(
  users: UserRepository,
  accessTokens: AccessTokenService = new FakeAccessTokenService(),
): RequestHandler {
  return requireAuth({ identifyUser: new IdentifyUser({ accessTokens, users }) });
}

/** Guarda de permisos real, montada sobre los dobles que se le pasen. */
export function testAuthorize(
  registry: PermissionRegistry,
  getUserAccess: UseCase<string, UserAccess>,
): PermissionGuard {
  return createPermissionGuard({
    checkPermission: new CheckPermission({ registry, getUserAccess }),
  });
}
