import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../../src/cli.ts";
import { diagnose } from "../../src/doctor.ts";
import { migrationName } from "../../src/patterns/pattern.ts";
import { inApplicationOrder, validatePatternSet } from "../../src/patterns/registry.ts";
import { applyPatternsToTree, migrationsIn } from "../../src/patterns/tree.ts";
import { ARCHITECTURES } from "../../src/registry.ts";
import { readTemplate } from "../../src/template.ts";
import { dependencies, FakeRunner, FakeUi } from "./helpers.ts";

describe("migrationName", () => {
  const now = new Date("2026-11-16T10:15:30Z");

  it("usa la fecha actual si es posterior a las existentes", () => {
    expect(migrationName(["20261115054401_create_roles"], now, "add_outbox")).toBe(
      "20261116101530_add_outbox",
    );
  });

  it("si el reloj va por detrás de la última migración, queda justo después", () => {
    expect(migrationName(["20270101000000_future"], now, "add_outbox")).toBe(
      "20270101000001_add_outbox",
    );
  });

  it("migrationsIn reconoce solo las carpetas con migration.sql", () => {
    expect(
      migrationsIn([
        "prisma/migrations/2026_a/migration.sql",
        "prisma/migrations/migration_lock.toml",
      ]),
    ).toEqual(["2026_a"]);
  });
});

describe("registro de patrones", () => {
  it("rechaza desconocidos y repetidos, y los ordena", () => {
    expect(() => validatePatternSet(["nope"])).toThrow('Unknown pattern "nope"');
    expect(() => validatePatternSet(["outbox", "outbox"])).toThrow("more than once");
    expect(validatePatternSet(["outbox"])).toEqual(["outbox"]);
    expect(inApplicationOrder(["outbox"])).toEqual(["outbox"]);
  });
});

describe.each(ARCHITECTURES)("outbox en %s", (architecture) => {
  it("sobre la plantilla: consume los marcadores, añade la migración y anota el manifiesto", async () => {
    const tree = readTemplate(architecture);
    const before = migrationsIn(tree.keys());

    await applyPatternsToTree(tree, ["outbox"], architecture, new Date("2026-11-16T10:00:00Z"));

    const added = migrationsIn(tree.keys()).filter((dir) => !before.includes(dir));
    expect(added).toHaveLength(1);
    expect(added[0]?.endsWith("_add_outbox")).toBe(true);
    expect((added[0] ?? "") > (before.sort().at(-1) ?? "")).toBe(true);
    const composition = tree.get("src/composition.ts")?.toString("utf8") ?? "";
    expect(composition).toContain("new DispatchOutbox(");
    expect(composition).toMatch(/dispatchOutbox,\n\s+\/\/ start-stack:returns/);
    expect(tree.get("src/main.ts")?.toString("utf8")).toContain("composed.dispatchOutbox");
    expect(tree.get(".env.example")?.toString("utf8")).toContain("OUTBOX_MAX_ATTEMPTS=10");
    expect(JSON.parse(tree.get(".scaffold.json")?.toString("utf8") ?? "{}").patterns).toEqual([
      "outbox",
    ]);
    expect(tree.get("prisma/schema.prisma")?.toString("utf8")).toContain("model OutboxMessage");
  });
});

describe.each(ARCHITECTURES)("create y add pattern en %s", (architecture) => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "start-stack-pattern-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("create --pattern outbox genera el proyecto ya con el patrón y doctor lo da por bueno", async () => {
    const code = await main(
      [
        "create",
        "shop",
        "-y",
        "--architecture",
        architecture,
        "--pattern",
        "outbox",
        "--no-git",
        "--no-install",
      ],
      dependencies({ cwd }),
    );

    expect(code).toBe(0);
    expect(diagnose(join(cwd, "shop"))).toEqual([]);
  });

  it("add pattern outbox lo aplica a un proyecto existente, una sola vez", async () => {
    await main(
      ["create", "shop", "-y", "--architecture", architecture, "--no-git", "--no-install"],
      dependencies({ cwd }),
    );
    const project = join(cwd, "shop");
    const runner = new FakeRunner();
    const ui = new FakeUi();

    const code = await main(
      ["add", "pattern", "outbox"],
      dependencies({ cwd: project, runner, ui }),
    );

    expect(code, ui.lines.join("\n")).toBe(0);
    expect(diagnose(project)).toEqual([]);
    expect(runner.commands()).toEqual(
      expect.arrayContaining(["npx prisma format", "npm run db:generate"]),
    );
    expect(ui.has("npm run db:migrate")).toBe(true);

    const again = new FakeUi();
    expect(
      await main(["add", "pattern", "outbox"], dependencies({ cwd: project, ui: again })),
    ).toBe(1);
    expect(again.has("already in .scaffold.json")).toBe(true);
  });

  it("--migrate aplica la migración y --dry-run no escribe nada", async () => {
    await main(
      ["create", "shop", "-y", "--architecture", architecture, "--no-git", "--no-install"],
      dependencies({ cwd }),
    );
    const project = join(cwd, "shop");
    const dry = new FakeRunner();

    await main(
      ["add", "pattern", "outbox", "--dry-run"],
      dependencies({ cwd: project, runner: dry }),
    );
    expect(dry.runs).toEqual([]);
    expect(readFileSync(join(project, ".scaffold.json"), "utf8")).not.toContain("outbox");

    const real = new FakeRunner();
    await main(
      ["add", "pattern", "outbox", "--migrate"],
      dependencies({ cwd: project, runner: real }),
    );
    expect(real.commands()).toContain("npm run db:migrate");
  });

  it("doctor avisa de lo que falta del patrón", async () => {
    await main(
      [
        "create",
        "shop",
        "-y",
        "--architecture",
        architecture,
        "--pattern",
        "outbox",
        "--no-git",
        "--no-install",
      ],
      dependencies({ cwd }),
    );
    const project = join(cwd, "shop");
    const main_ = join(project, "src/main.ts");
    writeFileSync(
      main_,
      readFileSync(main_, "utf8").replaceAll("composed.dispatchOutbox", "nothing"),
    );

    const messages = diagnose(project).map((finding) => finding.message);

    expect(messages).toEqual([expect.stringContaining("does not start the outbox worker")]);
  });

  it("sin marcadores se niega antes de escribir nada", async () => {
    await main(
      ["create", "shop", "-y", "--architecture", architecture, "--no-git", "--no-install"],
      dependencies({ cwd }),
    );
    const project = join(cwd, "shop");
    const path = join(project, "src/main.ts");
    writeFileSync(path, readFileSync(path, "utf8").replace("// start-stack:workers", ""));
    const ui = new FakeUi();

    const code = await main(["add", "pattern", "outbox"], dependencies({ cwd: project, ui }));

    expect(code).toBe(1);
    expect(ui.has("start-stack:workers")).toBe(true);
    expect(existsSync(join(project, "prisma/migrations"))).toBe(true);
    expect(readFileSync(join(project, ".scaffold.json"), "utf8")).not.toContain("outbox");
  });
});
