import { definePermissions } from "../permissions/permission.ts";

export const USERS_PERMISSION = {
  read: "users:read",
  update: "users:update",
} as const;

export const USERS_PERMISSIONS = definePermissions("users", {
  [USERS_PERMISSION.read]: { es: "Ver usuarios", en: "View users" },
  [USERS_PERMISSION.update]: {
    es: "Activar y desactivar usuarios",
    en: "Activate and deactivate users",
  },
});
