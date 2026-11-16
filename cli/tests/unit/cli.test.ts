import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HELP, main } from "../../src/cli.ts";
import { findFreePort } from "../../src/ports.ts";
import { dependencies, FakeRunner, FakeUi, ScriptedPrompter } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "start-stack-cli-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("main", () => {
  it("crea el proyecto con --yes: archivos, .env y los pasos posteriores", async () => {
    const runner = new FakeRunner();
    const ui = new FakeUi();

    const code = await main(
      ["create", "shop-api", "--yes", "--architecture", "clean"],
      dependencies({ cwd, runner, ui }),
    );

    expect(code).toBe(0);
    const project = join(cwd, "shop-api");
    expect(JSON.parse(readFileSync(join(project, "package.json"), "utf8")).name).toBe("shop-api");
    expect(readFileSync(join(project, ".env"), "utf8")).toMatch(/JWT_ACCESS_SECRET=[\w-]{60,}/);
    expect(JSON.parse(readFileSync(join(project, ".scaffold.json"), "utf8")).cliVersion).toBe(
      "9.9.9",
    );
    expect(existsSync(join(project, "docs/ADDING-A-FEATURE.md"))).toBe(true);
    expect(runner.commands()).toContain("npm ci");
    expect(ui.has("First entity: docs/ADDING-A-FEATURE.md")).toBe(true);
  });

  it("la guía que recomienda depende de la arquitectura", async () => {
    for (const [architecture, guide] of [
      ["hexagonal", "docs/ADDING-A-MODULE.md"],
      ["ddd", "docs/ADDING-A-CONTEXT.md"],
    ] as const) {
      const ui = new FakeUi();
      await main(
        [
          "create",
          `app-${architecture}`,
          "-y",
          "--architecture",
          architecture,
          "--no-install",
          "--no-git",
        ],
        dependencies({ cwd, ui }),
      );

      expect(ui.has(`First entity: ${guide}`)).toBe(true);
      expect(existsSync(join(cwd, `app-${architecture}`, guide))).toBe(true);
    }
  });

  it("--dry-run lista los archivos y no escribe nada", async () => {
    const runner = new FakeRunner();
    const ui = new FakeUi();

    const code = await main(
      ["create", "shop-api", "--yes", "--dry-run"],
      dependencies({ cwd, runner, ui }),
    );

    expect(code).toBe(0);
    expect(readdirSync(cwd)).toEqual([]);
    expect(runner.runs.filter((entry) => entry.command !== "docker")).toEqual([]);
    expect(ui.has("Dry run:")).toBe(true);
    expect(ui.has("package.json")).toBe(true);
    expect(ui.has("Nothing was written.")).toBe(true);
  });

  it("usa el puerto libre que se le da en el compose y en el .env", async () => {
    await main(
      ["create", "shop-api", "-y", "--no-install", "--no-git"],
      dependencies({ cwd, findFreePort: async () => 55437 }),
    );

    expect(readFileSync(join(cwd, "shop-api", "docker-compose.yml"), "utf8")).toContain(
      "55437:5432",
    );
    expect(readFileSync(join(cwd, "shop-api", ".env"), "utf8")).toContain(
      "127.0.0.1:55437/shop_api",
    );
  });

  it("--no-docker quita el Dockerfile", async () => {
    await main(
      ["create", "shop-api", "-y", "--no-docker", "--no-install", "--no-git"],
      dependencies({ cwd }),
    );

    expect(existsSync(join(cwd, "shop-api", "Dockerfile"))).toBe(false);
    expect(existsSync(join(cwd, "shop-api", "docker-compose.yml"))).toBe(true);
  });

  it("no pisa una carpeta que ya existe y tiene contenido", async () => {
    mkdirSync(join(cwd, "shop-api"));
    writeFileSync(join(cwd, "shop-api", "notas.txt"), "mío");
    const ui = new FakeUi();

    const code = await main(
      ["create", "shop-api", "-y", "--no-install"],
      dependencies({ cwd, ui }),
    );

    expect(code).toBe(1);
    expect(ui.has('The directory "shop-api" already exists and is not empty.')).toBe(true);
    expect(readFileSync(join(cwd, "shop-api", "notas.txt"), "utf8")).toBe("mío");
  });

  it("acepta una carpeta existente pero vacía", async () => {
    mkdirSync(join(cwd, "shop-api"));

    const code = await main(
      ["create", "shop-api", "-y", "--no-install", "--no-git"],
      dependencies({ cwd }),
    );

    expect(code).toBe(0);
  });

  it("sin nombre lo pregunta, y la cancelación termina con 130 sin escribir nada", async () => {
    const prompter = new ScriptedPrompter([]);
    prompter.text = async () => {
      const { CancelError } = await import("../../src/errors.ts");
      throw new CancelError();
    };
    const ui = new FakeUi();

    const code = await main(["create"], dependencies({ cwd, prompter, ui }));

    expect(code).toBe(130);
    expect(readdirSync(cwd)).toEqual([]);
    expect(ui.has("Cancelled")).toBe(true);
  });

  it("recorre el asistente completo cuando no se dan opciones", async () => {
    const prompter = new ScriptedPrompter([
      "shop-api",
      "monolith",
      "ddd",
      "node",
      "jwt",
      "none",
      "npm",
      false,
      false,
      false,
    ]);

    const code = await main(["create"], dependencies({ cwd, prompter, runner: new FakeRunner() }));

    expect(code).toBe(0);
    expect(prompter.remaining).toBe(0);
    expect(
      JSON.parse(readFileSync(join(cwd, "shop-api", ".scaffold.json"), "utf8")).apps[0]
        .architecture,
    ).toBe("ddd");
    expect(existsSync(join(cwd, "shop-api", "Dockerfile"))).toBe(false);
  });

  it.each([
    [
      ["create", "shop-api", "--architecture", "custom", "-y"],
      'architecture "custom" is not supported yet.',
    ],
    [["create", "shop-api", "--type", "microservices", "-y"], "not supported yet"],
    [["create", "Shop", "-y"], "Invalid project name"],
    [["create", "a", "b", "-y"], 'Unexpected argument "b"'],
    [["create", "-y"], "The project name is required"],
    [["create", "shop-api", "--nope"], "Unknown option '--nope'"],
    [["add", "module", "products"], "There is no .scaffold.json here"],
    [["add", "widget", "products"], 'Unknown "add" target "widget"'],
    [["add", "module", "a", "b"], 'Unexpected argument "b"'],
    [["doctor"], "There is no .scaffold.json here"],
    [["doctor", "now"], 'Unexpected argument "now"'],
    [["deploy"], 'Unknown command "deploy"'],
  ])("%j termina con error y lo explica", async (argv, message) => {
    const ui = new FakeUi();

    const code = await main(argv, dependencies({ cwd, ui }));

    expect(code).toBe(1);
    expect(ui.has(message)).toBe(true);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it("--help y --version no hacen nada más", async () => {
    const help = new FakeUi();
    const version = new FakeUi();

    expect(await main(["--help"], dependencies({ cwd, ui: help }))).toBe(0);
    expect(await main(["--version"], dependencies({ cwd, ui: version, cliVersion: "1.2.3" }))).toBe(
      0,
    );
    expect(await main([], dependencies({ cwd, ui: new FakeUi() }))).toBe(0);

    expect(help.lines).toEqual([`info:${HELP}`]);
    expect(version.lines).toEqual(["info:1.2.3"]);
  });
});

describe("findFreePort", () => {
  it("salta los puertos ocupados", async () => {
    const taken = new Set([55432, 55433]);

    expect(await findFreePort(55432, async (port) => !taken.has(port))).toBe(55434);
  });

  it("falla si no hay ninguno libre en el rango", async () => {
    await expect(findFreePort(55432, async () => false)).rejects.toThrow("No free port found");
  });

  it("con el comprobador real devuelve un puerto que se puede abrir", async () => {
    const port = await findFreePort(55900);

    expect(port).toBeGreaterThanOrEqual(55900);
  });
});
