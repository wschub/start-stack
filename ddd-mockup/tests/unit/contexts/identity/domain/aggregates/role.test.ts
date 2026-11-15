import { describe, expect, it } from "vitest";
import {
  Role,
  roleNameKey,
} from "../../../../../../src/contexts/identity/domain/aggregates/role.ts";
import { AppError } from "../../../../../../src/shared/errors/app-error.ts";

const T0 = new Date("2026-11-15T10:00:00Z");
const T1 = new Date("2026-11-15T11:00:00Z");

function codeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof AppError) return `${error.kind}:${error.code}`;
    throw error;
  }
  return "sin error";
}

const superAdmin = () =>
  Role.restore({
    publicId: "00000000-0000-4000-8000-000000000001",
    name: "SUPER_ADMIN",
    description: null,
    isSystem: true,
    permissions: [],
    createdAt: T0,
    updatedAt: T0,
  });

describe("Role", () => {
  it("crea un rol normal con el nombre limpio y los permisos sin repetir y ordenados", () => {
    const role = Role.create(
      {
        name: "  Jefe   de ventas ",
        description: "  Gestiona al equipo  ",
        permissions: ["users:read", "roles:read", "users:read"],
      },
      { generateId: () => "id-1", now: () => T0 },
    );

    expect(role.toProps()).toEqual({
      publicId: "id-1",
      name: "Jefe de ventas",
      description: "Gestiona al equipo",
      isSystem: false,
      permissions: ["roles:read", "users:read"],
      createdAt: T0,
      updatedAt: T0,
    });
    expect(role.isSuperAdmin()).toBe(false);
  });

  it("sin descripción ni permisos queda con null y lista vacía", () => {
    const role = Role.create({ name: "Soporte", description: "   " });

    expect(role.description).toBeNull();
    expect(role.permissions).toEqual([]);
    expect(role.publicId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(["", " ", "A", "x".repeat(51), "-Ventas", "Ventas!", "<script>"])(
    'rechaza el nombre "%s"',
    (name) => {
      expect(codeOf(() => Role.create({ name }))).toBe("validation:INVALID_ROLE_NAME");
    },
  );

  it.each(["SUPER_ADMIN", "super_admin", "Super Admin", " super-admin "])(
    'reserva el nombre del rol de sistema ("%s")',
    (name) => {
      expect(codeOf(() => Role.create({ name }))).toBe("conflict:ROLE_NAME_TAKEN");
    },
  );

  it("rechaza una descripción de más de 200 caracteres", () => {
    expect(codeOf(() => Role.create({ name: "Soporte", description: "x".repeat(201) }))).toBe(
      "validation:INVALID_ROLE_DESCRIPTION",
    );
  });

  it("update cambia solo lo que se indica y devuelve otra instancia", () => {
    const role = Role.create(
      { name: "Soporte", description: "Nivel 1", permissions: ["users:read"] },
      { now: () => T0 },
    );

    const updated = role.update({ permissions: ["roles:read"] }, () => T1);

    expect(updated).not.toBe(role);
    expect(updated.name).toBe("Soporte");
    expect(updated.description).toBe("Nivel 1");
    expect(updated.permissions).toEqual(["roles:read"]);
    expect(updated.updatedAt).toEqual(T1);
    expect(updated.createdAt).toEqual(T0);
    expect(role.permissions).toEqual(["users:read"]);
  });

  it("update puede borrar la descripción con null y valida el nombre nuevo", () => {
    const role = Role.create({ name: "Soporte", description: "Nivel 1" });

    expect(role.update({ description: null }).description).toBeNull();
    expect(codeOf(() => role.update({ name: "!" }))).toBe("validation:INVALID_ROLE_NAME");
    expect(codeOf(() => role.update({ name: "super admin" }))).toBe("conflict:ROLE_NAME_TAKEN");
  });

  it("el rol de sistema SUPER_ADMIN no se puede editar", () => {
    const role = superAdmin();

    expect(role.isSuperAdmin()).toBe(true);
    expect(codeOf(() => role.update({ description: "otra" }))).toBe(
      "forbidden:SYSTEM_ROLE_IMMUTABLE",
    );
    expect(codeOf(() => role.assertEditable())).toBe("forbidden:SYSTEM_ROLE_IMMUTABLE");
  });

  it("es inmutable", () => {
    const role = Role.create({ name: "Soporte", permissions: ["users:read"] });

    expect(Object.isFrozen(role)).toBe(true);
    expect(Object.isFrozen(role.permissions)).toBe(true);
  });

  it("roleNameKey ignora mayúsculas, espacios y guiones", () => {
    expect(roleNameKey(" Jefe de-Ventas ")).toBe("jefe_de_ventas");
    expect(roleNameKey("JEFE_DE_VENTAS")).toBe("jefe_de_ventas");
  });

  it("no anota eventos de dominio: hoy nadie reacciona a los cambios de un rol", () => {
    const role = Role.create({ name: "Soporte" });

    expect(role.pullEvents()).toEqual([]);
    expect(role.update({ name: "Soporte N2" }).pullEvents()).toEqual([]);
  });
});
