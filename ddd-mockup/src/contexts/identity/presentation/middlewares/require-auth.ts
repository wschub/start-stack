import type { RequestHandler, Response } from "express";
import { AppError } from "../../../../shared/errors/app-error.ts";
import { User } from "../../domain/aggregates/user.ts";
import type { UserRepository } from "../../domain/repositories/user.repository.ts";
import type { AccessTokenService } from "../../application/ports/access-token-service.ts";

const BEARER = /^Bearer\s+(\S+)$/i;

export function requireAuth(deps: {
  accessTokens: AccessTokenService;
  users: UserRepository;
}): RequestHandler {
  return async (req, res, next) => {
    const token = BEARER.exec(req.get("authorization") ?? "")?.[1];
    if (!token) throw new AppError("unauthenticated");

    const { subject } = await deps.accessTokens.verify(token);
    const user = await deps.users.findByPublicId(subject);
    if (!user) throw new AppError("unauthenticated", { code: "INVALID_TOKEN" });
    if (!user.isActive()) throw new AppError("forbidden", { code: "ACCOUNT_INACTIVE" });

    res.locals.user = user;
    next();
  };
}

/** Devuelve el usuario que dejó `requireAuth`; falla si se usa en una ruta sin protección. */
export function authenticatedUser(res: Response): User {
  const user: unknown = res.locals.user;
  if (!(user instanceof User)) throw new AppError("unauthenticated");
  return user;
}
