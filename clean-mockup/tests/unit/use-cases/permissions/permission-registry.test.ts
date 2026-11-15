import { describe, expect, it } from "vitest";
import {
  definePermissions,
  PermissionRegistry,
} from "../../../../src/use-cases/permissions/permission.ts";

const users = definePermissions("users", {
  "users:read": { es: "Ver usuarios", en: "View users" },
  "users:update": { es: "Editar usuarios", en: "Edit users" },
});
const products = definePermissions("products", {
  "products:read": { es: "Ver productos", en: "View products" },
});

describe("PermissionRegistry", () => {
  it("definePermissions asocia cada clave con su módulo y su nombre", () => {
    expect(users[0]).toEqual({
      key: "users:read",
      module: "users",
      label: { es: "Ver usuarios", en: "View users" },
    });
  });

  it("reúne los permisos de varios módulos", () => {
    const registry = new PermissionRegistry([...users, ...products]);

    expect(registry.keys()).toEqual(["users:read", "users:update", "products:read"]);
    expect(registry.has("products:read")).toBe(true);
    expect(registry.has("products:delete")).toBe(false);
  });

  it("los agrupa por módulo en el orden de registro", () => {
    const groups = new PermissionRegistry([...users, ...products]).groups();

    expect(groups.map((group) => group.module)).toEqual(["users", "products"]);
    expect(groups[0]?.permissions.map((permission) => permission.key)).toEqual([
      "users:read",
      "users:update",
    ]);
  });

  it("falla al construirse si dos módulos declaran la misma clave", () => {
    expect(() => new PermissionRegistry([...users, ...users])).toThrow(/Duplicate.*users:read/);
  });

  it.each(["users", "Users:read", "users:read:all", "users: read", ":read", "users:"])(
    'falla al construirse con la clave mal formada "%s"',
    (key) => {
      const bad = definePermissions("users", { [key]: { es: "x", en: "x" } });

      expect(() => new PermissionRegistry(bad)).toThrow(/Invalid permission key/);
    },
  );
});
