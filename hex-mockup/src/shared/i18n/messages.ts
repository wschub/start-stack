import type { Locale } from "./locale.ts";

export const MESSAGES: Record<Locale, Record<string, string>> = {
  en: {
    VALIDATION_ERROR: "The request is not valid.",
    INVALID_JSON: "The request body is not valid JSON.",
    PAYLOAD_TOO_LARGE: "The request body is too large.",
    TOO_MANY_REQUESTS: "Too many attempts. Please try again later.",
    SERVICE_UNAVAILABLE:
      "The service is temporarily unavailable. Please try again in a few seconds.",
    INVALID_EMAIL: "The email address is not valid.",
    INVALID_NAME: "The first name or last name is not valid.",
    INVALID_COUNTRY: "The country code is not valid.",
    INVALID_PHONE: "The phone number must use the international format, e.g. +573001234567.",
    INVALID_LOCALE: "The language is not supported.",
    WEAK_PASSWORD: "The password must be between 12 and 128 characters long.",
    UNAUTHENTICATED: "Authentication is required.",
    INVALID_CREDENTIALS: "Incorrect email or password.",
    TOKEN_EXPIRED: "The access token has expired.",
    INVALID_TOKEN: "The access token is not valid.",
    INVALID_REFRESH_TOKEN: "The session is not valid or has expired. Please sign in again.",
    REFRESH_TOKEN_REUSED: "Suspicious use of the session detected. Please sign in again.",
    FORBIDDEN: "You do not have permission to perform this action.",
    ACCOUNT_INACTIVE: "The account is inactive.",
    ORIGIN_NOT_ALLOWED: "The request origin is not allowed.",
    CSRF_HEADER_MISSING: "The X-CSRF-Protection header is required.",
    NOT_FOUND: "The requested resource was not found.",
    CONFLICT: "The request conflicts with the current state of the resource.",
    EMAIL_ALREADY_EXISTS: "An account with this email address already exists.",
    INTERNAL_ERROR: "An unexpected error occurred.",
  },
  es: {
    VALIDATION_ERROR: "La solicitud no es válida.",
    INVALID_JSON: "El cuerpo de la solicitud no es un JSON válido.",
    PAYLOAD_TOO_LARGE: "El cuerpo de la solicitud es demasiado grande.",
    TOO_MANY_REQUESTS: "Demasiados intentos. Inténtalo de nuevo más tarde.",
    SERVICE_UNAVAILABLE:
      "El servicio no está disponible temporalmente. Inténtalo de nuevo en unos segundos.",
    INVALID_EMAIL: "El correo electrónico no es válido.",
    INVALID_NAME: "El nombre o el apellido no es válido.",
    INVALID_COUNTRY: "El código de país no es válido.",
    INVALID_PHONE: "El teléfono debe tener formato internacional, por ejemplo +573001234567.",
    INVALID_LOCALE: "El idioma no está soportado.",
    WEAK_PASSWORD: "La contraseña debe tener entre 12 y 128 caracteres.",
    UNAUTHENTICATED: "Se requiere autenticación.",
    INVALID_CREDENTIALS: "Correo o contraseña incorrectos.",
    TOKEN_EXPIRED: "El token de acceso ha expirado.",
    INVALID_TOKEN: "El token de acceso no es válido.",
    INVALID_REFRESH_TOKEN: "La sesión no es válida o ha expirado. Inicia sesión de nuevo.",
    REFRESH_TOKEN_REUSED: "Se detectó un uso indebido de la sesión. Inicia sesión de nuevo.",
    FORBIDDEN: "No tienes permiso para realizar esta acción.",
    ACCOUNT_INACTIVE: "La cuenta está inactiva.",
    ORIGIN_NOT_ALLOWED: "El origen de la solicitud no está permitido.",
    CSRF_HEADER_MISSING: "Se requiere la cabecera X-CSRF-Protection.",
    NOT_FOUND: "No se encontró el recurso solicitado.",
    CONFLICT: "La solicitud entra en conflicto con el estado actual del recurso.",
    EMAIL_ALREADY_EXISTS: "Ya existe una cuenta con ese correo electrónico.",
    INTERNAL_ERROR: "Ocurrió un error inesperado.",
  },
};

export function translate(locale: Locale, code: string, fallbackCode: string): string {
  const catalog = MESSAGES[locale];
  return catalog[code] ?? catalog[fallbackCode] ?? catalog.INTERNAL_ERROR ?? "Error";
}
