import type { Locale } from "./locale.ts";

export const MESSAGES: Record<Locale, Record<string, string>> = {
  en: {
    VALIDATION_ERROR: "The request is not valid.",
    UNAUTHENTICATED: "Authentication is required.",
    FORBIDDEN: "You do not have permission to perform this action.",
    NOT_FOUND: "The requested resource was not found.",
    CONFLICT: "The request conflicts with the current state of the resource.",
    INTERNAL_ERROR: "An unexpected error occurred.",
  },
  es: {
    VALIDATION_ERROR: "La solicitud no es válida.",
    UNAUTHENTICATED: "Se requiere autenticación.",
    FORBIDDEN: "No tienes permiso para realizar esta acción.",
    NOT_FOUND: "No se encontró el recurso solicitado.",
    CONFLICT: "La solicitud entra en conflicto con el estado actual del recurso.",
    INTERNAL_ERROR: "Ocurrió un error inesperado.",
  },
};

export function translate(locale: Locale, code: string, fallbackCode: string): string {
  const catalog = MESSAGES[locale];
  return catalog[code] ?? catalog[fallbackCode] ?? catalog.INTERNAL_ERROR ?? "Error";
}
