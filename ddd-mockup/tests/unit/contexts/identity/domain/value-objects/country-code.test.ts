import { describe, expect, it } from "vitest";
import { CountryCode } from "../../../../../../src/contexts/identity/domain/value-objects/country-code.ts";
import { errorOf } from "../../../../../helpers/app-error.ts";

describe("CountryCode", () => {
  it("se guarda en mayúsculas y sin espacios alrededor", () => {
    expect(CountryCode.create(" co ").value).toBe("CO");
  });

  it.each(["", "C", "COL", "C0", "c-o", "57"])('rechaza "%s"', (raw) => {
    expect(errorOf(() => CountryCode.create(raw))).toBe("validation:INVALID_COUNTRY");
  });

  it("compara por valor y es inmutable", () => {
    const country = CountryCode.create("CO");

    expect(country.equals(CountryCode.create("co"))).toBe(true);
    expect(country.equals(CountryCode.create("ES"))).toBe(false);
    expect(Object.isFrozen(country)).toBe(true);
    expect(String(country)).toBe("CO");
  });

  it("restore no valida", () => {
    expect(CountryCode.restore("xx").value).toBe("xx");
  });
});
