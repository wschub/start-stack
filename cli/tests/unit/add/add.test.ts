import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../../../src/cli.ts";
import { ARCHITECTURES } from "../../../src/registry.ts";
import { dependencies, FakeRunner, FakeUi } from "../helpers.ts";

let cwd: string;
let project: string;

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), "start-stack-add-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

async function create(architecture: string): Promise<void> {
  const code = await main(
    ["create", "shop", "-y", "--architecture", architecture, "--no-git", "--no-install"],
    dependencies({ cwd }),
  );
  expect(code).toBe(0);
  project = join(cwd, "shop");
}

describe.each(ARCHITECTURES)("add module en %s", (architecture) => {
  it("crea los archivos, conecta la composición y anota el manifiesto", async () => {
    await create(architecture);
    const runner = new FakeRunner();
    const ui = new FakeUi();

    const code = await main(
      ["add", "module", "products", "--field", "name", "--field", "priceCents:int"],
      dependencies({ cwd: project, runner, ui }),
    );

    expect(code, ui.lines.join("\n")).toBe(0);
    const composition = readFileSync(join(project, "src/composition.ts"), "utf8");
    expect(composition).toContain("createProductsRouter");
    expect(composition).toContain("PRODUCTS_PERMISSIONS");
    expect(composition).toMatch(/productsRouter,\n\s+\/\/ start-stack:routers/);
    expect(readFileSync(join(project, "prisma/schema.prisma"), "utf8")).toMatch(
      /model Products {[^}]*priceCents Int[^}]*@@map\("products"\)/,
    );
    expect(existsSync(join(project, "tests/acceptance/products.test.ts"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(project, ".scaffold.json"), "utf8"));
    const list = architecture === "ddd" ? "contexts" : "modules";
    expect(manifest.apps[0][list]).toContain("products");
    expect(runner.commands()).toEqual(
      expect.arrayContaining(["npx prisma format", "npm run db:generate"]),
    );
    expect(runner.commands().some((command) => command.includes("migrate"))).toBe(false);
    expect(ui.has("npx prisma migrate dev --name add_products")).toBe(true);
  });

  it("--migrate crea la migración; --dry-run no escribe nada", async () => {
    await create(architecture);
    const dry = new FakeRunner();

    await main(["add", "module", "tags", "--dry-run"], dependencies({ cwd: project, runner: dry }));
    expect(dry.runs).toEqual([]);
    expect(existsSync(join(project, "tests/acceptance/tags.test.ts"))).toBe(false);

    const real = new FakeRunner();
    await main(
      ["add", "module", "tags", "--migrate"],
      dependencies({ cwd: project, runner: real }),
    );
    expect(real.commands()).toContain("npx prisma migrate dev --name add_tags");
  });

  it("un segundo módulo con el mismo nombre falla sin tocar nada", async () => {
    await create(architecture);
    await main(["add", "module", "tags"], dependencies({ cwd: project }));
    const before = readFileSync(join(project, "src/composition.ts"), "utf8");
    const ui = new FakeUi();

    const code = await main(["add", "module", "tags"], dependencies({ cwd: project, ui }));

    expect(code).toBe(1);
    expect(ui.has("already exist")).toBe(true);
    expect(readFileSync(join(project, "src/composition.ts"), "utf8")).toBe(before);
  });

  it("si falta un marcador se niega antes de escribir nada", async () => {
    await create(architecture);
    const path = join(project, "src/composition.ts");
    const original = readFileSync(path, "utf8");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, original.replace("// start-stack:wiring", ""));
    const ui = new FakeUi();

    const code = await main(["add", "module", "tags"], dependencies({ cwd: project, ui }));

    expect(code).toBe(1);
    expect(ui.has("start-stack:wiring")).toBe(true);
    expect(existsSync(join(project, "tests/acceptance/tags.test.ts"))).toBe(false);
  });
});
