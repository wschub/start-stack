import { describe, expect, it } from "vitest";
import { RoleName } from "../../../../../../src/contexts/identity/domain/value-objects/role-name.ts";
import { errorOf } from "../../../../../helpers/app-error.ts";

describe("RoleName", () => {
  it("quita los espacios de alrededor y junta los repetidos", () => {
    expect(RoleName.create("  Jefe   de ventas ").value).toBe("Jefe de ventas");
  });

  it.each(["Soporte", "Soporte N2", "jefe-de_ventas", "Dirección", "A1", "x".repeat(50)])(
    'acepta "%s"',
    (raw) => {
      expect(RoleName.create(raw).value).toBe(raw);
    },
  );

  it.each(["", " ", "A", "x".repeat(51), "-Ventas", "_Ventas", "Ventas!", "<script>", "a/b"])(
    'rechaza "%s"',
    (raw) => {
      expect(errorOf(() => RoleName.create(raw))).toBe("validation:INVALID_ROLE_NAME");
    },
  );

  it("la clave ignora mayúsculas, espacios, guiones y guiones bajos", () => {
    expect(RoleName.create("Jefe de ventas").key).toBe("jefe_de_ventas");
    expect(RoleName.keyOf(" JEFE-de__Ventas ")).toBe("jefe_de_ventas");
  });

  it("dos nombres son el mismo si comparten clave, aunque se escriban distinto", () => {
    const name = RoleName.create("Jefe de ventas");

    expect(name.equals(RoleName.create("jefe-de-ventas"))).toBe(true);
    expect(name.equals(RoleName.create("JEFE_DE_VENTAS"))).toBe(true);
    expect(name.equals(RoleName.create("Jefe de compras"))).toBe(false);
  });

  it("conserva la forma en que se escribió", () => {
    expect(String(RoleName.create("Jefe de Ventas"))).toBe("Jefe de Ventas");
  });

  it("restore no valida, pero sí calcula la clave", () => {
    const name = RoleName.restore("SUPER_ADMIN");

    expect(name.value).toBe("SUPER_ADMIN");
    expect(name.key).toBe("super_admin");
    expect(Object.isFrozen(name)).toBe(true);
  });
});
