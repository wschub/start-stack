import type { PermissionGroup, PermissionRegistry } from "../permissions/permission.ts";
import type { UseCase } from "../use-case.ts";

/** Catálogo de permisos agrupado por módulo, con el nombre de cada uno en todos los idiomas. */
export class ListPermissions implements UseCase<void, PermissionGroup[]> {
  private readonly registry: PermissionRegistry;

  constructor(deps: { registry: PermissionRegistry }) {
    this.registry = deps.registry;
  }

  async execute(): Promise<PermissionGroup[]> {
    return this.registry.groups();
  }
}
