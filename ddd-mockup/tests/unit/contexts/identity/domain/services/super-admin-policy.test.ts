import { describe, expect, it } from "vitest";
import { Role } from "../../../../../../src/contexts/identity/domain/aggregates/role.ts";
import {
  assertActorIsSuperAdmin,
  assertNotLastSuperAdmin,
  changesSuperAdminMembership,
  isSuperAdmin,
} from "../../../../../../src/contexts/identity/domain/services/super-admin-policy.ts";
import { errorOf } from "../../../../../helpers/app-error.ts";

const T0 = new Date("2026-11-15T10:00:00Z");
const system = (name: string) =>
  Role.restore({
    publicId: `id-${name}`,
    name,
    description: null,
    isSystem: true,
    permissions: [],
    createdAt: T0,
    updatedAt: T0,
  });

const SUPER_ADMIN = system("SUPER_ADMIN");
const SOPORTE = Role.create({ name: "Soporte", permissions: ["users:read"] });
const VENTAS = Role.create({ name: "Ventas" });

describe("política de superadministradores", () => {
  describe("isSuperAdmin", () => {
    it("lo es quien tiene el rol de sistema SUPER_ADMIN, junto a los que sean", () => {
      expect(isSuperAdmin([SUPER_ADMIN])).toBe(true);
      expect(isSuperAdmin([SOPORTE, SUPER_ADMIN])).toBe(true);
    });

    it("no lo es quien no tiene roles o solo tiene roles normales", () => {
      expect(isSuperAdmin([])).toBe(false);
      expect(isSuperAdmin([SOPORTE, VENTAS])).toBe(false);
    });

    it("otro rol de sistema no convierte a nadie en superadministrador", () => {
      expect(isSuperAdmin([system("AUDITOR")])).toBe(false);
    });
  });

  describe("changesSuperAdminMembership", () => {
    it.each([
      ["concederlo", [SOPORTE], [SOPORTE, SUPER_ADMIN], true],
      ["retirarlo", [SUPER_ADMIN, SOPORTE], [SOPORTE], true],
      [
        "conservarlo cambiando los demás roles",
        [SUPER_ADMIN, SOPORTE],
        [SUPER_ADMIN, VENTAS],
        false,
      ],
      ["cambiar roles normales", [SOPORTE], [VENTAS], false],
      ["dejar sin roles a quien no lo tenía", [SOPORTE], [], false],
    ])("%s → %s", (_case, current, requested, expected) => {
      expect(changesSuperAdminMembership(current, requested)).toBe(expected);
    });
  });

  describe("assertActorIsSuperAdmin", () => {
    it("deja pasar a un superadministrador", () => {
      expect(errorOf(() => assertActorIsSuperAdmin([SUPER_ADMIN]))).toBe("sin error");
    });

    it("rechaza a los demás con SUPER_ADMIN_REQUIRED", () => {
      expect(errorOf(() => assertActorIsSuperAdmin([SOPORTE]))).toBe(
        "forbidden:SUPER_ADMIN_REQUIRED",
      );
      expect(errorOf(() => assertActorIsSuperAdmin([]))).toBe("forbidden:SUPER_ADMIN_REQUIRED");
    });
  });

  describe("assertNotLastSuperAdmin", () => {
    it.each([0, 1])("con %i superadministradores activos rechaza el cambio", (count) => {
      expect(errorOf(() => assertNotLastSuperAdmin(count))).toBe("conflict:LAST_SUPER_ADMIN");
    });

    it("con dos o más lo permite", () => {
      expect(errorOf(() => assertNotLastSuperAdmin(2))).toBe("sin error");
    });
  });
});
