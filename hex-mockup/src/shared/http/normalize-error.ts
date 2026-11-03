import { AppError } from "../errors/app-error.ts";

/** Convierte los errores conocidos de librerías (body-parser) en errores de la aplicación. */
export function normalizeError(error: unknown): unknown {
  if (typeof error === "object" && error !== null && "type" in error) {
    const type = (error as { type?: unknown }).type;
    if (type === "entity.parse.failed") {
      return new AppError("validation", { code: "INVALID_JSON", cause: error });
    }
    if (type === "entity.too.large") {
      return new AppError("payload_too_large", { cause: error });
    }
  }
  return error;
}
