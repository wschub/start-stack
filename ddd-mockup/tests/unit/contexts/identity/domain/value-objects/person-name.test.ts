import { describe, expect, it } from "vitest";
import { PersonName } from "../../../../../../src/contexts/identity/domain/value-objects/person-name.ts";
import { AppError } from "../../../../../../src/shared/errors/app-error.ts";
import { errorOf } from "../../../../../helpers/app-error.ts";

describe("PersonName", () => {
  it("quita los espacios de alrededor y conserva los interiores", () => {
    expect(PersonName.create("  María José ", "firstName").value).toBe("María José");
  });

  it.each(["", "   ", "x".repeat(101)])('rechaza "%s"', (raw) => {
    expect(errorOf(() => PersonName.create(raw, "firstName"))).toBe("validation:INVALID_NAME");
  });

  it("admite exactamente 100 caracteres", () => {
    expect(PersonName.create("x".repeat(100), "lastName").value).toHaveLength(100);
  });

  it("el error indica qué campo falló", () => {
    const error = (() => {
      try {
        PersonName.create("", "lastName");
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).details).toEqual({ field: "lastName" });
  });

  it("compara por valor y es inmutable", () => {
    const name = PersonName.create("Ana", "firstName");

    expect(name.equals(PersonName.create(" Ana ", "lastName"))).toBe(true);
    expect(name.equals(PersonName.create("ana", "firstName"))).toBe(false);
    expect(Object.isFrozen(name)).toBe(true);
    expect(String(name)).toBe("Ana");
  });

  it("restore no valida", () => {
    expect(PersonName.restore("").value).toBe("");
  });
});
