import { definePermissions } from "../permissions/permission.ts";

export const AUTH_PERMISSION = {
  rolesRead: "roles:read",
  rolesManage: "roles:manage",
  rolesAssign: "roles:assign",
} as const;

export const AUTH_PERMISSIONS = definePermissions("auth", {
  [AUTH_PERMISSION.rolesRead]: { es: "Ver roles y permisos", en: "View roles and permissions" },
  [AUTH_PERMISSION.rolesManage]: {
    es: "Crear, editar y eliminar roles",
    en: "Create, edit and delete roles",
  },
  [AUTH_PERMISSION.rolesAssign]: { es: "Asignar roles a usuarios", en: "Assign roles to users" },
});
