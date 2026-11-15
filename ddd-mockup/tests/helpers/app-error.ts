import { AppError } from "../../src/shared/errors/app-error.ts";

/** "tipo:CÓDIGO" del AppError que lanza la acción, o "sin error". Otros errores se propagan. */
export function errorOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof AppError) return `${error.kind}:${error.code}`;
    throw error;
  }
  return "sin error";
}
