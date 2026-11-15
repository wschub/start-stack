import type { CookieOptions, Request, RequestHandler, Response } from "express";
import type {
  Controller,
  HttpCookieOptions,
  HttpRequest,
} from "../../interface-adapters/http/http.ts";
import { authenticatedUserOrUndefined } from "./middlewares/require-auth.ts";

function single(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return Array.isArray(value) ? value.map(String).join(", ") : undefined;
}

function strings(source: unknown): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  if (typeof source !== "object" || source === null) return result;
  for (const [key, value] of Object.entries(source)) result[key] = single(value);
  return result;
}

function toHttpRequest(req: Request, res: Response): HttpRequest {
  return {
    body: req.body,
    query: req.query,
    params: strings(req.params),
    headers: strings(req.headers),
    // Solo existe en las rutas que montan cookie-parser.
    cookies: strings(req.cookies),
    user: authenticatedUserOrUndefined(res),
  };
}

function cookieOptions(cookie: HttpCookieOptions): CookieOptions {
  return {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
  };
}

/**
 * Convierte un controlador (que no conoce Express) en un manejador de Express: le entrega la
 * petición como datos planos y escribe en `res` la respuesta que devuelve.
 */
export function adapt(controller: Controller): RequestHandler {
  return async (req, res) => {
    const result = await controller(toHttpRequest(req, res));

    for (const cookie of result.clearCookies ?? []) {
      res.clearCookie(cookie.name, cookieOptions(cookie));
    }
    // Express 5 lleva al manejador de errores lo que lanza un manejador asíncrono.
    if ("error" in result) throw result.error;

    for (const cookie of result.cookies ?? []) {
      res.cookie(cookie.name, cookie.value, { ...cookieOptions(cookie), expires: cookie.expires });
    }
    if (result.headers) res.set(result.headers);
    res.status(result.status);
    if (result.body === undefined) res.end();
    else res.json(result.body);
  };
}
