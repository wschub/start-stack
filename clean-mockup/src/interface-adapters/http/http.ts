import type { PublicUser } from "../../use-cases/users/public-user.ts";

/**
 * Petición y respuesta HTTP descritas con datos planos. Los controladores solo conocen estos
 * tipos: no saben qué framework web hay debajo, y por eso se prueban sin levantar un servidor.
 * El adaptador de cada framework (frameworks/express/adapt.ts) traduce en los dos sentidos.
 */
export interface HttpRequest {
  body: unknown;
  query: unknown;
  params: Readonly<Record<string, string | undefined>>;
  /** Cabeceras con el nombre en minúsculas. */
  headers: Readonly<Record<string, string | undefined>>;
  cookies: Readonly<Record<string, string | undefined>>;
  /** Quien hace la petición, si la ruta está protegida y ya se le identificó. */
  user?: PublicUser | undefined;
}

export interface HttpCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
}

export interface HttpCookie extends HttpCookieOptions {
  name: string;
  value: string;
  expires: Date;
}

/** Cookie que el navegador debe descartar. Las opciones deben coincidir con las de su creación. */
export interface HttpCookieRemoval extends HttpCookieOptions {
  name: string;
}

export interface HttpResponse {
  status: number;
  /** Se envía como JSON. Sin cuerpo, la respuesta va vacía. */
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  cookies?: readonly HttpCookie[];
  clearCookies?: readonly HttpCookieRemoval[];
}

/**
 * Un error que además debe cambiar algo en la respuesta (por ejemplo, descartar una cookie).
 * El error en sí lo traduce después el presentador de errores, como cualquier otro.
 */
export interface HttpFailure {
  error: unknown;
  clearCookies?: readonly HttpCookieRemoval[];
}

export type Controller = (request: HttpRequest) => Promise<HttpResponse | HttpFailure>;

export const ok = (body: unknown): HttpResponse => ({ status: 200, body });
export const created = (body: unknown): HttpResponse => ({ status: 201, body });
export const accepted = (): HttpResponse => ({ status: 202 });
export const noContent = (): HttpResponse => ({ status: 204 });
