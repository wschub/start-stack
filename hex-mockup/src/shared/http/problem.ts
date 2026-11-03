import { AppError, DEFAULT_ERROR_CODES, type ErrorKind } from "../errors/app-error.ts";
import type { Locale } from "../i18n/locale.ts";
import { translate } from "../i18n/messages.ts";

export interface ProblemDetails {
  type: "about:blank";
  title: string;
  status: number;
  code: string;
  detail: string;
}

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
};

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  500: "Internal Server Error",
};

export function toProblem(
  error: unknown,
  locale: Locale,
): { status: number; body: ProblemDetails } {
  if (error instanceof AppError) {
    const status = STATUS_BY_KIND[error.kind];
    return {
      status,
      body: {
        type: "about:blank",
        title: TITLES[status] ?? "Error",
        status,
        code: error.code,
        detail: translate(locale, error.code, DEFAULT_ERROR_CODES[error.kind]),
      },
    };
  }
  return {
    status: 500,
    body: {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      code: "INTERNAL_ERROR",
      detail: translate(locale, "INTERNAL_ERROR", "INTERNAL_ERROR"),
    },
  };
}
