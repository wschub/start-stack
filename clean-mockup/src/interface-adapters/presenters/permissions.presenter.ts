import type { Locale } from "../../entities/locale.ts";
import type { PermissionGroup } from "../../use-cases/permissions/permission.ts";

/** Catálogo de permisos agrupado por módulo, con el nombre de cada uno en el idioma pedido. */
export function presentPermissionCatalog(groups: readonly PermissionGroup[], locale: Locale) {
  return {
    groups: groups.map((group) => ({
      module: group.module,
      permissions: group.permissions.map(({ key, label }) => ({ key, label: label[locale] })),
    })),
  };
}
