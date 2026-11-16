import { describe, expect, it } from "vitest";
import type { ProjectOptions } from "../../src/options.ts";
import { runPostSteps } from "../../src/post.ts";
import { FakeRunner, FakeUi, ScriptedPrompter } from "./helpers.ts";

const options: ProjectOptions = {
  name: "shop-api",
  type: "monolith",
  architecture: "hexagonal",
  language: "node",
  auth: "jwt",
  frontend: "none",
  packageManager: "npm",
  docker: true,
  git: true,
  install: true,
  database: true,
  patterns: [],
};

const ADMIN = ["admin@example.com", "Ana", "Gómez", "una-clave-bastante-larga"];

function run(
  overrides: Partial<ProjectOptions> = {},
  runner = new FakeRunner(),
  answers = ADMIN,
  yes = false,
) {
  const prompter = new ScriptedPrompter(answers);
  const ui = new FakeUi();
  const done = runPostSteps({
    options: { ...options, ...overrides },
    dir: "/tmp/shop-api",
    runner,
    ui,
    prompter,
    yes,
  });
  return { done, runner, ui, prompter };
}

describe("runPostSteps", () => {
  it("hace todo en orden: git antes de instalar, después la base de datos y el superadministrador", async () => {
    const { done, runner } = run();

    const result = await done;

    expect(runner.commands()).toEqual([
      "git init -b main",
      "git add -A",
      "git commit -m chore: initial commit from start-stack",
      "npm ci",
      "npm run db:generate",
      "docker compose up -d --wait postgres",
      "npm run db:migrate",
      "npm run admin:create -- --email admin@example.com --first-name Ana --last-name Gómez",
    ]);
    expect(runner.runs.every((entry) => entry.options.cwd === "/tmp/shop-api")).toBe(true);
    expect(result).toMatchObject({
      gitInitialised: true,
      installed: true,
      databaseReady: true,
      adminCreated: true,
      manual: [],
    });
  });

  it("la contraseña viaja en el entorno y nunca en los argumentos", async () => {
    const { done, runner } = run();
    await done;

    const admin = runner.runs.at(-1);
    expect(admin?.options.env).toEqual({ ADMIN_PASSWORD: "una-clave-bastante-larga" });
    expect(runner.commands().join("\n")).not.toContain("una-clave-bastante-larga");
  });

  it("valida el correo y la contraseña antes de crear nada", async () => {
    const { done } = run({}, new FakeRunner(), [
      "no-es-correo",
      "Ana",
      "Gómez",
      "una-clave-bastante-larga",
    ]);

    await expect(done).rejects.toThrow("Enter a valid email");

    const short = run({}, new FakeRunner(), ["admin@example.com", "Ana", "Gómez", "corta"]);
    await expect(short.done).rejects.toThrow("Use between 12 and 128 characters");
  });

  it("sin git, sin instalar y sin base de datos solo indica lo que falta", async () => {
    const { done, runner } = run({ git: false, install: false, database: false });

    const result = await done;

    expect(runner.runs).toEqual([]);
    expect(result.manual).toEqual([
      "npm ci",
      "npm run db:generate",
      "docker compose up -d --wait postgres",
      "npm run db:migrate",
      "npm run admin:create",
    ]);
  });

  it("si falla un paso muestra el final de su salida, sigue con los demás y lo deja como pendiente", async () => {
    const runner = new FakeRunner((entry) =>
      entry.args[0] === "ci"
        ? { code: 1, output: "npm error network down" }
        : { code: 0, output: "" },
    );
    const { done, ui } = run({ database: true }, runner);

    const result = await done;

    expect(ui.has("Installing dependencies failed.")).toBe(true);
    expect(ui.has("npm error network down")).toBe(true);
    expect(result.installed).toBe(false);
    expect(result.gitInitialised).toBe(true);
    expect(result.manual).toContain("npm ci");
    // Sin dependencias no se intenta preparar la base de datos.
    expect(runner.commands().some((command) => command.includes("docker compose"))).toBe(false);
  });

  it("si falla la migración no pide los datos del superadministrador", async () => {
    const runner = new FakeRunner((entry) =>
      entry.args.includes("db:migrate")
        ? { code: 1, output: "connection refused" }
        : { code: 0, output: "" },
    );
    const { done, prompter } = run({}, runner, []);

    const result = await done;

    expect(prompter.asked).toEqual([]);
    expect(result.databaseReady).toBe(false);
    expect(result.manual).toEqual(["docker compose up -d --wait postgres", "npm run db:migrate"]);
  });

  it("si falla la creación del superadministrador lo deja como pendiente", async () => {
    const runner = new FakeRunner((entry) =>
      entry.args.includes("admin:create") ? { code: 1, output: "boom" } : { code: 0, output: "" },
    );
    const { done } = run({}, runner);

    const result = await done;

    expect(result.adminCreated).toBe(false);
    expect(result.manual).toEqual(["npm run admin:create"]);
  });

  it("con --yes no puede pedir los datos del superadministrador: deja el comando", async () => {
    const { done, prompter } = run({}, new FakeRunner(), [], true);

    const result = await done;

    expect(prompter.asked).toEqual([]);
    expect(result.databaseReady).toBe(true);
    expect(result.manual).toEqual(["npm run admin:create"]);
  });

  it("si git no puede hacer el commit (sin nombre de usuario) avisa y no interrumpe", async () => {
    const runner = new FakeRunner((entry) =>
      entry.args[0] === "commit"
        ? { code: 128, output: "Please tell me who you are." }
        : { code: 0, output: "" },
    );
    const { done, ui } = run({ database: false }, runner);

    const result = await done;

    expect(result.gitInitialised).toBe(false);
    expect(result.installed).toBe(true);
    expect(ui.has("Please tell me who you are.")).toBe(true);
  });
});
