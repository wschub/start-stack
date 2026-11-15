import { z } from "zod";

const name = z.string().max(200);
const description = z.string().max(1000).nullable();
const permissions = z.array(z.string().max(100)).max(500);

export const createRoleSchema = z
  .object({ name, description: description.optional(), permissions: permissions.optional() })
  .strict();

export const updateRoleSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    permissions: permissions.optional(),
  })
  .strict();

export const assignRolesSchema = z
  .object({ roleIds: z.array(z.string().max(64)).max(100) })
  .strict();
