import { describe, expect, it } from "vitest";
import { insertAboveMarker, planChanges } from "../../../src/add/apply.ts";

describe("insertAboveMarker", () => {
  it("inserta justo encima del marcador y lo conserva", () => {
    const result = insertAboveMarker("a.ts", "uno\n  // start-stack:x\ndos\n", "x", ["  nuevo"]);

    expect(result).toBe("uno\n  nuevo\n  // start-stack:x\ndos\n");
  });

  it("varias inserciones en el mismo marcador conservan el orden", () => {
    const first = insertAboveMarker("a.ts", "// start-stack:x\n", "x", ["1"]);
    const second = insertAboveMarker("a.ts", first, "x", ["2"]);

    expect(second).toBe("1\n2\n// start-stack:x\n");
  });

  it("funciona con comentarios de Prisma (// ) y se niega si falta o está repetido", () => {
    expect(() => insertAboveMarker("a.ts", "nada\n", "x", ["1"])).toThrow("is missing");
    expect(() =>
      insertAboveMarker("a.ts", "// start-stack:x\n// start-stack:x\n", "x", ["1"]),
    ).toThrow("more than once");
  });

  it("no confunde un marcador con otro que empieza igual", () => {
    expect(() =>
      insertAboveMarker("a.ts", "// start-stack:messages-en\n", "messages", ["1"]),
    ).toThrow("is missing");
  });
});

describe("planChanges", () => {
  const rendered = {
    files: new Map([["src/new.ts", "x"]]),
    edits: [{ path: "src/main.ts", marker: "m", lines: ["a"] }],
  };

  it("no escribe nada si un archivo nuevo ya existe", () => {
    expect(() => planChanges(rendered, () => "existe")).toThrow("already exist");
  });

  it("no escribe nada si falta el archivo a editar", () => {
    expect(() =>
      planChanges(rendered, (path) => (path === "src/new.ts" ? undefined : undefined)),
    ).toThrow("does not exist");
  });

  it("devuelve archivos nuevos y editados", () => {
    const plan = planChanges(rendered, (path) =>
      path === "src/main.ts" ? "// start-stack:m\n" : undefined,
    );

    expect([...plan.created.keys()]).toEqual(["src/new.ts"]);
    expect(plan.updated.get("src/main.ts")).toBe("a\n// start-stack:m\n");
  });
});
