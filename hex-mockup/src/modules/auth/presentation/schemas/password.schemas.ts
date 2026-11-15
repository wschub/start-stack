import { z } from "zod";

export const forgotPasswordSchema = z
  .object({
    email: z.string().max(320),
    /** "link" envía un enlace con token; "code" envía un código de 6 dígitos. */
    method: z.enum(["link", "code"]).default("link"),
  })
  .strict();

const password = z.string().max(1024);

/** O bien el token del enlace, o bien el correo y el código; nunca las dos cosas. */
export const resetPasswordSchema = z.union([
  z.object({ token: z.string().min(1).max(512), password }).strict(),
  z
    .object({
      email: z.string().max(320),
      code: z.string().regex(/^\d{6}$/),
      password,
    })
    .strict(),
]);
