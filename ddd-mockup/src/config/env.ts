import { z } from "zod";
import { isValidDuration, parseDuration } from "../shared/duration.ts";

const postgresUrl = z.string().refine((value) => {
  if (!URL.canParse(value)) return false;
  return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
}, "must be a PostgreSQL connection URL");

const MAX_ACCESS_TOKEN_SECONDS = 24 * 60 * 60;
const MAX_REFRESH_TOKEN_SECONDS = 90 * 24 * 60 * 60;
const MAX_PASSWORD_RESET_SECONDS = 24 * 60 * 60;

/** Duración con unidad (30s, 50m, 1h, 7d) que se entrega ya convertida a segundos. */
function duration(fallback: string, maxSeconds: number) {
  return z.preprocess(
    (value) => value ?? fallback,
    z
      .string()
      .refine(isValidDuration, "must look like 30s, 50m, 1h or 7d")
      .transform(parseDuration)
      .refine((seconds) => seconds <= maxSeconds, "is too long"),
  );
}

/** Un origen es esquema + host (+ puerto), sin barra final ni ruta. */
function isOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && url.origin === value;
}

/** URL http(s) completa de una página del front, por ejemplo la de cambio de contraseña. */
function isHttpUrl(value: string): boolean {
  return URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol);
}

function booleanFlag(fallback: "true" | "false") {
  return z.preprocess(
    (value) => value ?? fallback,
    z.enum(["true", "false"]).transform((value) => value === "true"),
  );
}

const originList = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : (value ?? []),
  z.array(z.string().refine(isOrigin, "must be an origin such as https://app.example.com")),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: postgresUrl,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "must be at least 32 characters")
    .refine((value) => !value.startsWith("change-me"), "must not be the example placeholder"),
  JWT_ISSUER: z.string().min(1).default("ddd-mockup"),
  JWT_AUDIENCE: z.string().min(1).default("ddd-mockup-api"),
  ACCESS_TOKEN_EXPIRATION_TIME: duration("60m", MAX_ACCESS_TOKEN_SECONDS),
  REFRESH_TOKEN_EXPIRATION_TIME: duration("7d", MAX_REFRESH_TOKEN_SECONDS),
  PASSWORD_RESET_EXPIRATION_TIME: duration("30m", MAX_PASSWORD_RESET_SECONDS),
  PASSWORD_RESET_URL: z
    .string()
    .refine(isHttpUrl, "must be an http(s) URL")
    .default("http://localhost:5173/reset-password"),
  PUBLIC_REGISTRATION: booleanFlag("true"),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("strict"),
  CORS_ORIGINS: originList,
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
});

/** Nombres de todas las variables que valida el esquema; .env.example debe documentar las mismas. */
export const ENV_VARIABLES: readonly string[] = Object.keys(schema.shape);

/** Las duraciones de los tokens están expresadas en segundos. */
export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[], reason?: string) {
    super(
      `Invalid or missing environment variables: ${variables.join(", ")}${reason ? ` (${reason})` : ""}`,
    );
    this.name = "EnvError";
    this.variables = variables;
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new EnvError(variables);
  }

  const env = result.data;
  if (env.REFRESH_TOKEN_EXPIRATION_TIME <= env.ACCESS_TOKEN_EXPIRATION_TIME) {
    throw new EnvError(
      ["REFRESH_TOKEN_EXPIRATION_TIME"],
      "must be longer than ACCESS_TOKEN_EXPIRATION_TIME",
    );
  }
  if (env.COOKIE_SAME_SITE === "none" && env.NODE_ENV !== "production") {
    throw new EnvError(
      ["COOKIE_SAME_SITE"],
      "none requires NODE_ENV=production because the cookie must be Secure",
    );
  }
  return env;
}
