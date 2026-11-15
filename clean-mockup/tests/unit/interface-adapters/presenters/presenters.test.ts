import { describe, expect, it } from "vitest";
import {
  presentProfile,
  presentUserRoles,
} from "../../../../src/interface-adapters/presenters/access.presenter.ts";
import { presentPermissionCatalog } from "../../../../src/interface-adapters/presenters/permissions.presenter.ts";
import { presentSession } from "../../../../src/interface-adapters/presenters/session.presenter.ts";
import { ANA } from "../../../helpers/http-request.ts";

const ACCESS = {
  roles: [
    { publicId: "role-1", name: "Soporte" },
    { publicId: "role-2", name: "Ventas" },
  ],
  permissions: ["roles:read", "users:read"],
  isSuperAdmin: false,
};

describe("presentSession", () => {
  it("expone el access token como Bearer y nunca el refresh token", () => {
    const json = presentSession({
      accessToken: "access-1",
      accessTokenExpiresIn: 900,
      refreshToken: "refresh-1",
      refreshTokenExpiresAt: new Date("2026-11-22T10:00:00Z"),
    });

    expect(json).toEqual({ accessToken: "access-1", tokenType: "Bearer", expiresIn: 900 });
  });
});

describe("presentProfile", () => {
  it("resume los roles a sus nombres y añade los permisos", () => {
    expect(presentProfile(ANA, ACCESS)).toEqual({
      user: ANA,
      roles: ["Soporte", "Ventas"],
      permissions: ["roles:read", "users:read"],
    });
  });
});

describe("presentUserRoles", () => {
  it("devuelve los roles con su id y los permisos, sin el indicador interno isSuperAdmin", () => {
    expect(presentUserRoles({ ...ACCESS, isSuperAdmin: true })).toEqual({
      roles: ACCESS.roles,
      permissions: ACCESS.permissions,
    });
  });
});

describe("presentPermissionCatalog", () => {
  const groups = [
    {
      module: "auth",
      permissions: [
        { key: "roles:read", module: "auth", label: { es: "Ver roles", en: "View roles" } },
        {
          key: "roles:manage",
          module: "auth",
          label: { es: "Gestionar roles", en: "Manage roles" },
        },
      ],
    },
    { module: "users", permissions: [] },
  ];

  it("deja una sola etiqueta por permiso, en el idioma pedido", () => {
    expect(presentPermissionCatalog(groups, "en")).toEqual({
      groups: [
        {
          module: "auth",
          permissions: [
            { key: "roles:read", label: "View roles" },
            { key: "roles:manage", label: "Manage roles" },
          ],
        },
        { module: "users", permissions: [] },
      ],
    });
    expect(presentPermissionCatalog(groups, "es").groups[0]?.permissions[0]?.label).toBe(
      "Ver roles",
    );
  });
});
