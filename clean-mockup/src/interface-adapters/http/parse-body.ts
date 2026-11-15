import type { z } from "zod";
import { AppError } from "../../entities/errors/app-error.ts";

interface FieldIssue {
  field: string;
  code: string;
}

/** Valida un cuerpo con un esquema Zod. Los errores nombran el campo y el tipo de fallo, nunca el valor. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;

  const issues: FieldIssue[] = result.error.issues.flatMap((issue) => {
    const path = issue.path.map(String);
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        field: [...path, key].join("."),
        code: "unrecognized_key",
      }));
    }
    return [{ field: path.join(".") || "body", code: issue.code }];
  });

  throw new AppError("validation", { code: "VALIDATION_ERROR", details: { issues } });
}
