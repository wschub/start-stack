export type ErrorKind =
  "validation" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "payload_too_large";

export const DEFAULT_ERROR_CODES: Record<ErrorKind, string> = {
  validation: "VALIDATION_ERROR",
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  not_found: "NOT_FOUND",
  conflict: "CONFLICT",
  payload_too_large: "PAYLOAD_TOO_LARGE",
};

export interface AppErrorOptions {
  code?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(kind: ErrorKind, options: AppErrorOptions = {}) {
    const code = options.code ?? DEFAULT_ERROR_CODES[kind];
    super(code, { cause: options.cause });
    this.name = "AppError";
    this.kind = kind;
    this.code = code;
    this.details = options.details;
  }
}
