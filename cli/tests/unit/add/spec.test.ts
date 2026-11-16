import { describe, expect, it } from "vitest";
import { buildSpec, namesOf, parseField } from "../../../src/add/spec.ts";

describe("parseField", () => {
  it("sin tipo es string", () => {
    expect(parseField("name")).toEqual({ name: "name", type: "string" });
  });

  it("acepta los cuatro tipos", () => {
    expect(parseField("priceCents:int").type).toBe("int");
    expect(parseField("active:boolean").type).toBe("boolean");
    expect(parseField("startsAt:datetime").type).toBe("datetime");
  });

  it.each(["Name", "price_cents", "a:b:c", "price:decimal", "id", "createdAt", ":int", "events"])(
    "rechaza %j",
    (raw) => {
      expect(() => parseField(raw)).toThrow();
    },
  );
});

describe("buildSpec", () => {
  it("la entidad por defecto es el módulo y el campo por defecto es name", () => {
    expect(buildSpec({ module: "products", fields: [] })).toEqual({
      module: "products",
      entity: "products",
      path: "products",
      fields: [{ name: "name", type: "string" }],
    });
  });

  it.each(["Products", "order_items", "-a", "a--b", "auth", "users", "x".repeat(41)])(
    "rechaza el módulo %j",
    (module) => {
      expect(() => buildSpec({ module, fields: [] })).toThrow();
    },
  );

  it("la ruta puede ser distinta del módulo, pero no una ruta de la base ni inválida", () => {
    expect(buildSpec({ module: "catalog", path: "products", fields: [] }).path).toBe("products");
    expect(() => buildSpec({ module: "catalog", path: "users", fields: [] })).toThrow(
      "base project",
    );
    expect(() => buildSpec({ module: "catalog", path: "Products", fields: [] })).toThrow("path");
    expect(namesOf(buildSpec({ module: "shop", path: "order-items", fields: [] })).pathCamel).toBe(
      "orderItems",
    );
  });

  it("rechaza campos repetidos", () => {
    expect(() => buildSpec({ module: "shop", fields: ["a:int", "a:string"] })).toThrow("repeated");
  });
});

describe("namesOf", () => {
  it("deriva todos los nombres de un módulo con guiones", () => {
    const names = namesOf(buildSpec({ module: "order-items", entity: "order-item", fields: [] }));

    expect(names).toMatchObject({
      moduleCamel: "orderItems",
      ModulePascal: "OrderItems",
      MODULE_UPPER: "ORDER_ITEMS",
      moduleSnake: "order_items",
      entityCamel: "orderItem",
      EntityPascal: "OrderItem",
      ENTITY_UPPER: "ORDER_ITEM",
    });
  });
});
