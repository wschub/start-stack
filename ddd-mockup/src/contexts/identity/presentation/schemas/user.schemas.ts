import { z } from "zod";

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().max(100).optional(),
  })
  .strict();

export const changeStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).strict();
