import { AppError } from "../../entities/errors/app-error.ts";
import type { PublicUser } from "../../use-cases/users/public-user.ts";
import type { HttpRequest } from "./http.ts";

/** Quien hace la petición; falla si el controlador se monta en una ruta sin autenticación. */
export function currentUser(request: HttpRequest): PublicUser {
  if (!request.user) throw new AppError("unauthenticated");
  return request.user;
}
