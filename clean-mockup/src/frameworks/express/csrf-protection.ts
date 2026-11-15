import type { RequestHandler } from "express";
import { AppError } from "../../entities/errors/app-error.ts";

/**
 * Defensa CSRF para endpoints que se autentican con una cookie:
 *  1. Si la petición trae Origin, debe estar en la lista (un navegador siempre lo envía en un POST).
 *  2. Exige una cabecera propia: una página de otro sitio no puede añadirla sin un preflight de CORS,
 *     y el CORS estricto lo deniega.
 * Se suma a la cookie SameSite. Los clientes que no son navegadores no envían Origin y pasan.
 */
export function csrfProtection(options: { allowedOrigins: readonly string[] }): RequestHandler {
  const allowed = new Set(options.allowedOrigins);
  return (req, _res, next) => {
    const origin = req.get("origin");
    if (origin !== undefined && !allowed.has(origin)) {
      throw new AppError("forbidden", { code: "ORIGIN_NOT_ALLOWED" });
    }
    if (!req.get("x-csrf-protection")) {
      throw new AppError("forbidden", { code: "CSRF_HEADER_MISSING" });
    }
    next();
  };
}
