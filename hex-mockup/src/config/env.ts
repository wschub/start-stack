import { z } from "zod";
import { isValidDuration, parseDuration } from "../shared/duration.ts";

const postgresUrl = z.string().refine((value) => {
  if (!URL.canParse(value)) return false;
  return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
}, "must be a PostgreSQL connection URL");

const MAX_ACCESS_TOKEN_SECONDS = 24 * 60 * 60;
const MAX_REFRESH_TOKEN_SECONDS = 90 * 24 * 60 * 60;

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

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: postgresUrl,
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, "must be at least 32 characters")
      .refine((value) => !value.startsWith("change-me"), "must not be the example placeholder"),
    ACCESS_TOKEN_EXPIRATION_TIME: duration("60m", MAX_ACCESS_TOKEN_SECONDS),
    REFRESH_TOKEN_EXPIRATION_TIME: duration("7d", MAX_REFRESH_TOKEN_SECONDS),
  })
  .refine((env) => env.REFRESH_TOKEN_EXPIRATION_TIME > env.ACCESS_TOKEN_EXPIRATION_TIME, {
    path: ["REFRESH_TOKEN_EXPIRATION_TIME"],
    message: "must be longer than ACCESS_TOKEN_EXPIRATION_TIME",
  });

/** Las duraciones de los tokens están expresadas en segundos. */
export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(`Invalid or missing environment variables: ${variables.join(", ")}`);
    this.name = "EnvError";
    this.variables = variables;
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  throw new EnvError(variables);
}
