import { describe, expect, it } from "vitest";
import { negotiateLocale } from "../../../src/shared/i18n/locale.ts";

describe("negotiateLocale", () => {
  it("usa el idioma por defecto sin cabecera", () => {
    expect(negotiateLocale(undefined)).toBe("es");
  });

  it("elige inglés cuando se pide", () => {
    expect(negotiateLocale("en")).toBe("en");
  });

  it("ignora la región", () => {
    expect(negotiateLocale("en-US")).toBe("en");
    expect(negotiateLocale("es-CO")).toBe("es");
  });

  it("respeta los pesos q", () => {
    expect(negotiateLocale("es;q=0.5, en;q=0.9")).toBe("en");
  });

  it("toma el primer idioma soportado de la lista", () => {
    expect(negotiateLocale("fr, en;q=0.8, es;q=0.7")).toBe("en");
  });

  it("descarta los idiomas con q=0", () => {
    expect(negotiateLocale("es;q=0, en")).toBe("en");
  });

  it("cae al idioma por defecto si ninguno está soportado", () => {
    expect(negotiateLocale("fr-FR, de")).toBe("es");
  });
});
