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
 * El patrón outbox, de las dos maneras: elegido al crear el proyecto y añadido después con
 * `add pattern`. En los dos casos el proyecto debe pasar su `verify` completo, incluida la
 * integración con Postgres real, y `doctor` no debe tener nada que decir.
 */
const workspace = mkdtempSync(join(tmpdir(), "start-stack-e2e-outbox-"));

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

async function verifyProject(project: string): Promise<void> {
  const doctorUi = new FakeUi();
  const doctor = await main(["doctor"], deps(project, doctorUi));
  expect(doctor, doctorUi.lines.join("\n")).toBe(0);

  const verify = await processRunner.run("npm", ["run", "verify"], { cwd: project });
  expect(verify.code, verify.output.split("\n").slice(-60).join("\n")).toBe(0);
  expect(verify.output).toMatch(/Tests\s+\d+ passed/);
}

describe.each(ARCHITECTURES)("outbox: %s", (architecture) => {
  it("elegido al crear el proyecto", async () => {
    const ui = new FakeUi();
    const name = `outbox-create-${architecture}`;
    const code = await main(
      [
        "create",
        name,
        "-y",
        "--architecture",
        architecture,
        "--pattern",
        "outbox",
        "--no-database",
      ],
      deps(workspace, ui),
    );
    expect(code, ui.lines.join("\n")).toBe(0);

    await verifyProject(join(workspace, name));
  });

  it("añadido después con add pattern, junto a un módulo", async () => {
    const ui = new FakeUi();
    const name = `outbox-add-${architecture}`;
    const created = await main(
      ["create", name, "-y", "--architecture", architecture, "--no-database"],
      deps(workspace, ui),
    );
    expect(created, ui.lines.join("\n")).toBe(0);
    const project = join(workspace, name);

    const database = await processRunner.run("docker", ["compose", "up", "-d", "--wait"], {
      cwd: project,
    });
    expect(database.code, database.output).toBe(0);
    try {
      const pattern = await main(["add", "pattern", "outbox", "--migrate"], deps(project, ui));
      expect(pattern, ui.lines.join("\n")).toBe(0);
      const module = await main(["add", "module", "products", "--migrate"], deps(project, ui));
      expect(module, ui.lines.join("\n")).toBe(0);

      await verifyProject(project);
    } finally {
      await processRunner.run("docker", ["compose", "down", "-v"], { cwd: project });
    }
  });
});
