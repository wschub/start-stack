import type { Locale } from "../i18n/locale.ts";

/**
 * Un permiso es una clave estable "recurso:acción" (por ejemplo "users:read"). Cada módulo declara
 * los suyos en `application/permissions.ts` y composition.ts los reúne en un PermissionRegistry.
 */
export interface PermissionDefinition {
  key: string;
  /** Módulo que lo declara; sirve para agruparlos en la pantalla de gestión de roles. */
  module: string;
  /** Nombre legible, en cada idioma soportado. */
  label: Record<Locale, string>;
}

const KEY = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export function definePermissions(
  module: string,
  permissions: Record<string, Record<Locale, string>>,
): readonly PermissionDefinition[] {
  return Object.entries(permissions).map(([key, label]) => ({ key, module, label }));
}

export interface PermissionGroup {
  module: string;
  permissions: readonly PermissionDefinition[];
}

/** Catálogo de todos los permisos de la aplicación. Falla al arrancar si hay claves mal formadas o repetidas. */
export class PermissionRegistry {
  private readonly byKey = new Map<string, PermissionDefinition>();

  constructor(definitions: readonly PermissionDefinition[]) {
    for (const definition of definitions) {
      if (!KEY.test(definition.key)) {
        throw new Error(`Invalid permission key "${definition.key}": expected "resource:action"`);
      }
      if (this.byKey.has(definition.key)) {
        throw new Error(`Duplicate permission key "${definition.key}"`);
      }
      this.byKey.set(definition.key, definition);
    }
  }

  has(key: string): boolean {
    return this.byKey.has(key);
  }

  keys(): string[] {
    return [...this.byKey.keys()];
  }

  /** Permisos agrupados por módulo, en el orden en que se registraron. */
  groups(): PermissionGroup[] {
    const groups = new Map<string, PermissionDefinition[]>();
    for (const definition of this.byKey.values()) {
      const group = groups.get(definition.module) ?? [];
      group.push(definition);
      groups.set(definition.module, group);
    }
    return [...groups].map(([module, permissions]) => ({ module, permissions }));
  }
}
