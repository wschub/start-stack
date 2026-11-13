import { AppError } from "../errors/app-error.ts";

/** Códigos de Prisma que indican que la base de datos no está al alcance, no que la petición sea mala. */
const DATABASE_UNAVAILABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

/** Convierte los errores conocidos de librerías (body-parser, Prisma) en errores de la aplicación. */
export function normalizeError(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return error;
  const { type, name, code } = error as { type?: unknown; name?: unknown; code?: unknown };

  if (type === "entity.parse.failed") {
    return new AppError("validation", { code: "INVALID_JSON", cause: error });
  }
  if (type === "entity.too.large") {
    return new AppError("payload_too_large", { cause: error });
  }
  if (
    name === "PrismaClientKnownRequestError" &&
    typeof code === "string" &&
    DATABASE_UNAVAILABLE_CODES.has(code)
  ) {
    return new AppError("service_unavailable", { cause: error });
  }
  return error;
}
