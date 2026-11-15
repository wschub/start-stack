import { describe, expect, it } from "vitest";
import { assertSupportedDefaults, validateChoice, validateProjectName } from "../../src/options.ts";
import { STEPS, stepById } from "../../src/registry.ts";

describe("validateProjectName", () => {
  it.each(["a", "api", "my-api", "api2", "shop-backend-v2"])("acepta %s", (name) => {
    expect(validateProjectName(name)).toBeUndefined();
  });

  it.each([
    ["", "required"],
    ["My-Api", "lowercase"],
    ["2api", "lowercase"],
    ["-api", "lowercase"],
    ["api-", "lowercase"],
    ["my api", "lowercase"],
    ["my_api", "lowercase"],
    ["../api", "lowercase"],
    ["@scope/api", "lowercase"],
    ["a".repeat(51), "at most 50"],
  ])('rechaza "%s"', (name, reason) => {
    expect(validateProjectName(name)).toContain(reason);
  });
});

describe("validateChoice", () => {
  const architecture = stepById("architecture");

  it.each(["hexagonal", "ddd", "clean"])("acepta la arquitectura %s", (value) => {
    expect(() => validateChoice(architecture, value)).not.toThrow();
  });

  it("explica que una opción aún no soportada llegará más adelante", () => {
    expect(() => validateChoice(architecture, "custom")).toThrow(
      'architecture "custom" is not supported yet.',
    );
    expect(() => validateChoice(stepById("type"), "microservices")).toThrow("not supported yet");
  });

  it("rechaza un valor desconocido y lista los válidos", () => {
    expect(() => validateChoice(architecture, "onion")).toThrow(
      'Unknown architecture "onion". Valid values: hexagonal, ddd, clean, custom.',
    );
  });
});

describe("registro de opciones", () => {
  it("el valor por defecto de cada paso existe y está soportado", () => {
    expect(() => assertSupportedDefaults()).not.toThrow();
  });

  it("cada paso tiene una bandera única y al menos una opción soportada", () => {
    const flags = STEPS.map((step) => step.flag);

    expect(new Set(flags).size).toBe(flags.length);
    for (const step of STEPS) {
      expect(step.choices.some((choice) => choice.supported)).toBe(true);
    }
  });
});
