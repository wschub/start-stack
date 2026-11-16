import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MARKERS } from "../../../src/add/markers.ts";
import { renderClean } from "../../../src/add/render-clean.ts";
import { renderDdd } from "../../../src/add/render-ddd.ts";
import { renderHexagonal } from "../../../src/add/render-hexagonal.ts";
import { buildSpec } from "../../../src/add/spec.ts";
import { main } from "../../../src/cli.ts";
import { diagnose } from "../../../src/doctor.ts";
import { ARCHITECTURES } from "../../../src/registry.ts";
import { dependencies, FakeUi } from "../helpers.ts";

let cwd: string;
let project: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "start-stack-doctor-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

async function createWithModule(architecture: string): Promise<void> {
  await main(
    ["create", "shop", "-y", "--architecture", architecture, "--no-git", "--no-install"],
    dependencies({ cwd }),
  );
  project = join(cwd, "shop");
  await main(["add", "module", "products"], dependencies({ cwd: project }));
}

describe("los marcadores que declara doctor son los que usan los renderizadores", () => {
  it.each([
    ["hexagonal", renderHexagonal],
    ["ddd", renderDdd],
    ["clean", renderClean],
  ] as const)("%s", (architecture, render) => {
    const used = render(buildSpec({ module: "shop", fields: [] })).edits.map(
      (edit) => `${edit.path}#${edit.marker}`,
    );
    const declared = MARKERS[architecture].map((site) => `${site.path}#${site.marker}`);

    expect(new Set(used)).toEqual(new Set(declared));
  });
});

describe.each(ARCHITECTURES)("doctor en %s", (architecture) => {
  it("un proyecto recién generado, con un módulo añadido, solo avisa de la migración pendiente", async () => {
    await createWithModule(architecture);

    const findings = diagnose(project);

    expect(findings.filter((finding) => finding.level === "error")).toEqual([]);
    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining('no migration creates the table "products"'),
    ]);
  });

  it("detecta un marcador borrado", async () => {
    await createWithModule(architecture);
    const path = join(project, "src/composition.ts");
    writeFileSync(path, readFileSync(path, "utf8").replace("// start-stack:routers", ""));

    const messages = diagnose(project).map((finding) => finding.message);

    expect(messages).toContain(
      'src/composition.ts: the marker "// start-stack:routers" is missing.',
    );
  });

  it("detecta un módulo del manifiesto sin carpeta y una carpeta sin manifiesto", async () => {
    await createWithModule(architecture);
    const manifestPath = join(project, ".scaffold.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const list = architecture === "ddd" ? "contexts" : "modules";
    manifest.apps[0][list] = manifest.apps[0][list].filter((name: string) => name !== "products");
    manifest.apps[0][list].push("ghost");
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const findings = diagnose(project);

    expect(findings.some((f) => f.level === "error" && f.message.includes('"ghost"'))).toBe(true);
    expect(
      findings.some((f) => f.level === "warning" && f.message.includes("/products is not listed")),
    ).toBe(true);
  });

  it("detecta un módulo sin modelo de Prisma", async () => {
    await createWithModule(architecture);
    const path = join(project, "prisma/schema.prisma");
    writeFileSync(path, readFileSync(path, "utf8").replace('@@map("products")', ""));

    const messages = diagnose(project).map((finding) => finding.message);

    expect(
      messages.some((message) => message.includes('table "products"') && message.includes("model")),
    ).toBe(true);
  });

  it("el comando devuelve 0 sin problemas y 1 con errores", async () => {
    await createWithModule(architecture);
    const ok = await main(["doctor"], dependencies({ cwd: project }));
    rmSync(join(project, "src"), { recursive: true });
    const ui = new FakeUi();
    const bad = await main(["doctor"], dependencies({ cwd: project, ui }));

    expect(ok).toBe(0);
    expect(bad).toBe(1);
    expect(ui.has("error:")).toBe(true);
  });
});
