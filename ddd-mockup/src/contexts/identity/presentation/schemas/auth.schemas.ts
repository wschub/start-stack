import { z } from "zod";

/** Los esquemas son estrictos: un campo desconocido se rechaza en vez de ignorarse. */
export const registerSchema = z
  .object({
    email: z.string().max(320),
    password: z.string().max(1024),
    firstName: z.string().max(200),
    lastName: z.string().max(200),
    countryDefault: z.string().max(10).nullish(),
    mobilePhone: z.string().max(30).nullish(),
    locale: z.string().max(10).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().max(320),
    password: z.string().max(1024),
  })
  .strict();
