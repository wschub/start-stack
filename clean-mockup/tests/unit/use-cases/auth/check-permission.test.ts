import { describe, expect, it } from "vitest";
import { CheckPermission } from "../../../../src/use-cases/auth/check-permission.use-case.ts";
import type { UserAccess } from "../../../../src/use-cases/auth/get-user-access.use-case.ts";
import { ListPermissions } from "../../../../src/use-cases/auth/list-permissions.use-case.ts";
import { testRegistry } from "../../../helpers/role-fakes.ts";
import { StubUseCase } from "../../../helpers/use-case-fakes.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const withPermissions = (permissions: string[]) => {
  const getUserAccess = StubUseCase.returning<string, UserAccess>({
    roles: [],
    permissions,
    isSuperAdmin: false,
  });
  return { getUserAccess, check: new CheckPermission({ registry: testRegistry(), getUserAccess }) };
};

describe("CheckPermission", () => {
  it("deja pasar a quien tiene el permiso, consultando su acceso actual", async () => {
    const { check, getUserAccess } = withPermissions(["users:read", "roles:read"]);

    await expect(
      check.execute({ userPublicId: USER, permission: "users:read" }),
    ).resolves.toBeUndefined();
    expect(getUserAccess.calls).toEqual([USER]);
  });

  it("rechaza con PERMISSION_DENIED a quien no lo tiene", async () => {
    const { check } = withPermissions(["roles:read"]);

    await expect(
      check.execute({ userPublicId: USER, permission: "users:read" }),
    ).rejects.toMatchObject({ kind: "forbidden", code: "PERMISSION_DENIED" });
  });

  it("no acepta un permiso parecido: la clave debe coincidir entera", async () => {
    const { check } = withPermissions(["users:read"]);

    await expect(
      check.execute({ userPublicId: USER, permission: "users:update" }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("assertRegistered falla con un permiso que no está en el catálogo", () => {
    const { check } = withPermissions([]);

    expect(() => check.assertRegistered("users:read")).not.toThrow();
    expect(() => check.assertRegistered("products:read")).toThrow(/not registered/);
  });
});

describe("ListPermissions", () => {
  it("devuelve el catálogo agrupado, con las etiquetas en todos los idiomas", async () => {
    const groups = await new ListPermissions({ registry: testRegistry() }).execute();

    expect(groups.map((group) => group.module)).toEqual(["auth", "users"]);
    expect(groups[1]?.permissions.map((permission) => permission.key)).toEqual([
      "users:read",
      "users:update",
    ]);
    expect(groups[0]?.permissions[0]?.label).toEqual({
      es: expect.any(String),
      en: expect.any(String),
    });
  });
});
