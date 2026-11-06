import { AppError, DEFAULT_ERROR_CODES, type ErrorKind } from "../errors/app-error.ts";
import type { Locale } from "../i18n/locale.ts";
import { translate } from "../i18n/messages.ts";

export interface FieldError {
  field: string;
  code: string;
}

export interface ProblemDetails {
  type: "about:blank";
  title: string;
  status: number;
  code: string;
  detail: string;
  errors?: FieldError[];
}

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  too_many_requests: 429,
};

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Payload Too Large",
  429: "Too Many Requests",
  500: "Internal Server Error",
};

function fieldErrors(error: AppError): FieldError[] | undefined {
  const issues = error.details?.issues;
  if (!Array.isArray(issues)) return undefined;
  const result: FieldError[] = [];
  for (const issue of issues as unknown[]) {
    if (typeof issue !== "object" || issue === null) continue;
    const { field, code } = issue as { field?: unknown; code?: unknown };
    if (typeof field === "string" && typeof code === "string") result.push({ field, code });
  }
  return result.length > 0 ? result : undefined;
}

export function toProblem(
  error: unknown,
  locale: Locale,
): { status: number; body: ProblemDetails } {
  if (error instanceof AppError) {
    const status = STATUS_BY_KIND[error.kind];
    const errors = fieldErrors(error);
    return {
      status,
      body: {
        type: "about:blank",
        title: TITLES[status] ?? "Error",
        status,
        code: error.code,
        detail: translate(locale, error.code, DEFAULT_ERROR_CODES[error.kind]),
        ...(errors ? { errors } : {}),
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
