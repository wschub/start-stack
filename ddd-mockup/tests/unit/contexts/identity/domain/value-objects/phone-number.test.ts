import { describe, expect, it } from "vitest";
import { PhoneNumber } from "../../../../../../src/contexts/identity/domain/value-objects/phone-number.ts";
import { errorOf } from "../../../../../helpers/app-error.ts";

describe("PhoneNumber", () => {
  it.each(["+573001234567", "+34600123456", "+1234567", "+123456789012345"])(
    "acepta %s (E.164)",
    (raw) => {
      expect(PhoneNumber.create(` ${raw} `).value).toBe(raw);
    },
  );

  it.each([
    ["sin prefijo internacional", "3001234567"],
    ["con espacios", "+57 300 123 4567"],
    ["con guiones", "+57-300-1234567"],
    ["que empieza por cero", "+0573001234567"],
    ["demasiado corto", "+123456"],
    ["demasiado largo", "+1234567890123456"],
    ["con letras", "+57300ABC4567"],
    ["vacío", ""],
  ])("rechaza un teléfono %s", (_case, raw) => {
    expect(errorOf(() => PhoneNumber.create(raw))).toBe("validation:INVALID_PHONE");
  });

  it("compara por valor y es inmutable", () => {
    const phone = PhoneNumber.create("+573001234567");

    expect(phone.equals(PhoneNumber.create("+573001234567"))).toBe(true);
    expect(phone.equals(PhoneNumber.create("+573001234568"))).toBe(false);
    expect(Object.isFrozen(phone)).toBe(true);
    expect(String(phone)).toBe("+573001234567");
  });

  it("restore no valida", () => {
    expect(PhoneNumber.restore("300").value).toBe("300");
  });
});
