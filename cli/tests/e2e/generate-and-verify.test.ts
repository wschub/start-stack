import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../../src/cli.ts";
import { findFreePort } from "../../src/ports.ts";
import { processRunner } from "../../src/runner.ts";
import { ARCHITECTURES } from "../../src/registry.ts";
import { FakeUi, ScriptedPrompter } from "../unit/helpers.ts";

/**
 * Genera cada arquitectura con el CLI de verdad, instala las dependencias y ejecuta el `verify` del
 * proyecto generado: lint, formato, tipos y todas las pruebas, incluidas las de integración con
 * Postgres real (necesita Docker y red).
 */
const workspace = mkdtempSync(join(tmpdir(), "start-stack-e2e-"));

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe.each(ARCHITECTURES)("proyecto generado: %s", (architecture) => {
  it("se genera, se instala y pasa su propio verify", async () => {
    const ui = new FakeUi();
    const name = `e2e-${architecture}`;

    const code = await main(
      ["create", name, "--yes", "--architecture", architecture, "--no-database"],
      {
        prompter: new ScriptedPrompter([]),
        ui,
        runner: processRunner,
        cwd: workspace,
        cliVersion: "0.0.0-e2e",
        findFreePort: () => findFreePort(),
      },
    );
    expect(code, ui.lines.join("\n")).toBe(0);

    const project = join(workspace, name);
    const verify = await processRunner.run("npm", ["run", "verify"], { cwd: project });

    expect(verify.code, verify.output.split("\n").slice(-40).join("\n")).toBe(0);
    expect(verify.output).toMatch(/Tests\s+\d+ passed/);

    // El primer commit se hizo antes de instalar y el árbol quedó limpio: nada generado se versiona.
    const status = await processRunner.run("git", ["status", "--short"], { cwd: project });
    expect(status.output.trim()).toBe("");
  });
});
