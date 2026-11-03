import { z } from "zod";

const postgresUrl = z.string().refine((value) => {
  if (!URL.canParse(value)) return false;
  return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
}, "must be a PostgreSQL connection URL");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: postgresUrl,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

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
