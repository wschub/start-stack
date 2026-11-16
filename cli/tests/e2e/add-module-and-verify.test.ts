import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../../src/cli.ts";
import { findFreePort } from "../../src/ports.ts";
import { ARCHITECTURES } from "../../src/registry.ts";
import { processRunner } from "../../src/runner.ts";
import { FakeUi, ScriptedPrompter } from "../unit/helpers.ts";

/**
 * Genera cada arquitectura, le añade un módulo con los cuatro tipos de campo y ejecuta el `verify`
 * del proyecto: el código generado por `add module` debe pasar lint, formato, tipos, el test de
 * arquitectura y sus propias pruebas.
 */
const workspace = mkdtempSync(join(tmpdir(), "start-stack-e2e-add-"));

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function deps(cwd: string, ui: FakeUi) {
  return {
    prompter: new ScriptedPrompter([]),
    ui,
    runner: processRunner,
    cwd,
    cliVersion: "0.0.0-e2e",
    findFreePort: () => findFreePort(),
  };
}

describe.each(ARCHITECTURES)("add module: %s", (architecture) => {
  it("el módulo añadido pasa el verify del proyecto", async () => {
    const ui = new FakeUi();
    const name = `add-${architecture}`;
    const created = await main(
      ["create", name, "--yes", "--architecture", architecture, "--no-database"],
      deps(workspace, ui),
    );
    expect(created, ui.lines.join("\n")).toBe(0);
    const project = join(workspace, name);

    // El módulo trae una prueba de integración contra Postgres: necesita su tabla, o sea, la migración.
    const database = await processRunner.run("docker", ["compose", "up", "-d", "--wait"], {
      cwd: project,
    });
    expect(database.code, database.output).toBe(0);
    try {
      const added = await main(
        [
          "add",
          "module",
          "order-items",
          "--entity",
          "order-item",
          "--field",
          "name",
          "--field",
          "priceCents:int",
          "--field",
          "active:boolean",
          "--field",
          "startsAt:datetime",
          "--migrate",
        ],
        deps(project, ui),
      );
      expect(added, ui.lines.join("\n")).toBe(0);

      // Con la migración creada, doctor no tiene nada que decir.
      const doctorUi = new FakeUi();
      expect(await main(["doctor"], deps(project, doctorUi)), doctorUi.lines.join("\n")).toBe(0);
      expect(doctorUi.has("Everything is in place.")).toBe(true);

      const verify = await processRunner.run("npm", ["run", "verify"], { cwd: project });
      expect(verify.code, verify.output.split("\n").slice(-60).join("\n")).toBe(0);
      expect(verify.output).toMatch(/Tests\s+\d+ passed/);
    } finally {
      await processRunner.run("docker", ["compose", "down", "-v"], { cwd: project });
    }
  });
});
