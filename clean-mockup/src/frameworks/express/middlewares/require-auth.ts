import type { RequestHandler, Response } from "express";
import { AppError } from "../../../entities/errors/app-error.ts";
import type { UseCase } from "../../../use-cases/use-case.ts";
import type { PublicUser } from "../../../use-cases/users/public-user.ts";

const BEARER = /^Bearer\s+(\S+)$/i;

/** Identifica a quien hace la petición por su access token y lo deja disponible para la ruta. */
export function requireAuth(deps: { identifyUser: UseCase<string, PublicUser> }): RequestHandler {
  return async (req, res, next) => {
    const token = BEARER.exec(req.get("authorization") ?? "")?.[1];
    if (!token) throw new AppError("unauthenticated");

    res.locals.user = await deps.identifyUser.execute(token);
    next();
  };
}

function isPublicUser(value: unknown): value is PublicUser {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { publicId?: unknown }).publicId === "string"
  );
}

export function authenticatedUserOrUndefined(res: Response): PublicUser | undefined {
  const user: unknown = res.locals.user;
  return isPublicUser(user) ? user : undefined;
}

/** Devuelve el usuario que dejó `requireAuth`; falla si se usa en una ruta sin protección. */
export function authenticatedUser(res: Response): PublicUser {
  const user = authenticatedUserOrUndefined(res);
  if (!user) throw new AppError("unauthenticated");
  return user;
}
