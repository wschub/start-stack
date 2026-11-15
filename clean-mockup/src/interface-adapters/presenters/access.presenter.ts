import type { UserAccess } from "../../use-cases/auth/get-user-access.use-case.ts";
import type { PublicUser } from "../../use-cases/users/public-user.ts";

/** Perfil más lo que el front necesita para mostrar u ocultar secciones: roles y permisos. */
export function presentProfile(user: PublicUser, access: UserAccess) {
  return {
    user,
    roles: access.roles.map((role) => role.name),
    permissions: access.permissions,
  };
}

/** Roles y permisos de un usuario, para la pantalla de administración. */
export function presentUserRoles(access: UserAccess) {
  return { roles: access.roles, permissions: access.permissions };
}
