import type { z } from "zod";
import { AppError } from "../errors/app-error.ts";

/** Valida un cuerpo con un esquema Zod. Los errores nombran el campo y el tipo de fallo, nunca el valor. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  throw new AppError("validation", {
    code: "VALIDATION_ERROR",
    details: {
      issues: result.error.issues.map((issue) => ({
        field: issue.path.map(String).join("."),
        code: issue.code,
      })),
    },
  });
}
