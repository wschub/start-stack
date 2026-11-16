import { describe, expect, it } from "vitest";
import { CancelError } from "../../src/errors.ts";
import { collectOptions, type Flags } from "../../src/wizard.ts";
import { FakeUi, ScriptedPrompter } from "./helpers.ts";

const noFlags: Flags = { choices: {}, yes: false };

function environment(answers: (string | boolean | string[])[], docker = true) {
  const prompter = new ScriptedPrompter(answers);
  const ui = new FakeUi();
  return { prompter, ui, env: { prompter, ui, isDockerAvailable: async () => docker } };
}

/** Respuestas del recorrido completo con los valores por defecto, salvo lo que se cambie. */
const walkthrough = (
  name: string,
  architecture = "hexagonal",
  rest: boolean[] = [true, true, true, true],
) => [name, "monolith", architecture, "node", "jwt", "none", "npm", [], ...rest];

describe("collectOptions", () => {
  it("recorre todas las preguntas, en orden, y devuelve las opciones", async () => {
    const { env, prompter } = environment(walkthrough("shop-api", "ddd"));

    const options = await collectOptions(noFlags, env);

    expect(options).toEqual({
      name: "shop-api",
      type: "monolith",
      architecture: "ddd",
      language: "node",
      auth: "jwt",
      frontend: "none",
      packageManager: "npm",
      docker: true,
      git: true,
      install: true,
      database: true,
      patterns: [],
    });
    expect(prompter.asked).toEqual([
      "Project name",
      "Project type",
      "Architecture",
      "Language",
      "Authentication",
      "Frontend",
      "Package manager",
      "Patterns (space to select, enter to continue)",
      "Include a Dockerfile and a container for the API?",
      "Initialise a git repository?",
      "Install dependencies now?",
      "Start the database and create the super administrator now?",
    ]);
    expect(prompter.remaining).toBe(0);
  });

  it("pone la explicación de cada arquitectura debajo de su título, conservando la pista", async () => {
    const { env, prompter } = environment(walkthrough("shop-api"));
    await collectOptions(noFlags, env);

    const options = prompter.selectOptions.Architecture ?? [];
    const supported = options.filter((option) => option.description !== undefined);
    expect(supported.map((option) => option.value)).toEqual(["hexagonal", "ddd", "clean"]);
    for (const option of supported) {
      expect(option.hint).toBeTruthy();
      expect(option.description).toContain("Monolith:");
      expect(option.description).toContain("Microservices:");
    }
  });

  it("muestra las opciones que aún no existen, marcadas, para que se vea el mapa del proyecto", async () => {
    const { env, prompter } = environment(walkthrough("shop-api"));

    await collectOptions(noFlags, env);

    const labels = prompter.selectOptions.Architecture?.map((option) => option.label);
    expect(labels).toEqual([
      "Hexagonal",
      "Domain-Driven Design",
      "Clean Architecture",
      "Custom (coming soon)",
    ]);
    expect(prompter.selectOptions["Project type"]?.map((option) => option.label)).toContain(
      "Microservices (coming soon)",
    );
  });

  it("si se elige una opción no soportada avisa y vuelve a preguntar", async () => {
    const answers = [
      "shop-api",
      "microservices",
      "monolith",
      "hexagonal",
      "node",
      "jwt",
      "none",
      "npm",
      [],
      true,
      true,
      true,
      true,
    ];
    const { env, ui } = environment(answers);

    const options = await collectOptions(noFlags, env);

    expect(options.type).toBe("monolith");
    expect(ui.has('"microservices" is not supported yet')).toBe(true);
  });

  it("recuerda al usuario lo que el proyecto ya incluye siempre", async () => {
    const { env, ui } = environment(walkthrough("shop-api"));

    await collectOptions(noFlags, env);

    expect(ui.has("Patterns")).toBe(false);
    expect(ui.has("TDD with Vitest")).toBe(true);
  });

  it("no pregunta lo que ya vino en la terminal", async () => {
    const { env, prompter } = environment([
      "monolith",
      "node",
      "jwt",
      "none",
      "npm",
      [],
      true,
      true,
      true,
    ]);
    const flags: Flags = {
      name: "shop-api",
      choices: { architecture: "clean" },
      docker: false,
      yes: false,
    };

    const options = await collectOptions(flags, env);

    expect(options).toMatchObject({ name: "shop-api", architecture: "clean", docker: false });
    expect(prompter.asked).not.toContain("Architecture");
    expect(prompter.asked).not.toContain("Project name");
  });

  it("con --yes usa los valores por defecto y no pregunta nada", async () => {
    const { env, prompter } = environment([]);

    const options = await collectOptions({ name: "shop-api", choices: {}, yes: true }, env);

    expect(options).toMatchObject({
      architecture: "hexagonal",
      docker: true,
      git: true,
      install: true,
      database: true,
    });
    expect(prompter.asked).toEqual([]);
  });

  it("con --yes exige el nombre", async () => {
    const { env } = environment([]);

    await expect(collectOptions({ choices: {}, yes: true }, env)).rejects.toThrow(
      "The project name is required",
    );
  });

  it("rechaza un nombre inválido o una opción no soportada dada en la terminal", async () => {
    const { env } = environment([]);

    await expect(collectOptions({ name: "Shop API", choices: {}, yes: true }, env)).rejects.toThrow(
      'Invalid project name "Shop API"',
    );
    await expect(
      collectOptions({ name: "shop-api", choices: { type: "microservices" }, yes: true }, env),
    ).rejects.toThrow('type "microservices" is not supported yet.');
    await expect(
      collectOptions({ name: "shop-api", choices: { architecture: "onion" }, yes: true }, env),
    ).rejects.toThrow('Unknown architecture "onion"');
  });

  it("sin Docker o sin instalar no ofrece preparar la base de datos", async () => {
    const withoutDocker = environment(
      walkthrough("shop-api", "hexagonal", [true, true, true]),
      false,
    );
    const withoutInstall = environment(walkthrough("shop-api", "hexagonal", [true, true, false]));

    expect((await collectOptions(noFlags, withoutDocker.env)).database).toBe(false);
    expect((await collectOptions(noFlags, withoutInstall.env)).database).toBe(false);
    expect(withoutDocker.prompter.asked.at(-1)).toBe("Install dependencies now?");
  });

  it("--database sin Docker es un error que explica qué falta", async () => {
    const { env } = environment([], false);

    await expect(
      collectOptions({ name: "shop-api", choices: {}, database: true, yes: true }, env),
    ).rejects.toThrow("--database needs the dependencies installed and Docker running");
  });

  it("--no-database se respeta aunque haya Docker", async () => {
    const { env } = environment([]);

    const options = await collectOptions(
      { name: "shop-api", choices: {}, database: false, yes: true },
      env,
    );

    expect(options.database).toBe(false);
  });

  it("si el usuario cancela, el error se propaga", async () => {
    const prompter = new ScriptedPrompter([]);
    prompter.text = async () => {
      throw new CancelError();
    };

    await expect(
      collectOptions(noFlags, { prompter, ui: new FakeUi(), isDockerAvailable: async () => true }),
    ).rejects.toBeInstanceOf(CancelError);
  });
  it("ofrece los patrones con su explicación y devuelve los elegidos", async () => {
    const { env, prompter, ui } = environment([
      "shop-api",
      "monolith",
      "hexagonal",
      "node",
      "jwt",
      "none",
      "npm",
      ["outbox"],
      true,
      true,
      true,
      true,
    ]);

    const options = await collectOptions(noFlags, env);

    expect(options.patterns).toEqual(["outbox"]);
    const offered = prompter.selectOptions["Patterns (space to select, enter to continue)"];
    expect(offered?.map((option) => option.value)).toEqual(["outbox"]);
    expect(offered?.[0]?.hint).toMatch(/transacción/);
    expect(ui.has("Coming soon: Cloud Tasks, Kafka, Saga")).toBe(true);
  });

  it("--pattern se valida y evita la pregunta; con --yes no hay patrones", async () => {
    const given = await collectOptions(
      { name: "shop", choices: {}, yes: true, patterns: ["outbox"] },
      environment([]).env,
    );
    const none = await collectOptions(
      { name: "shop", choices: {}, yes: true },
      environment([]).env,
    );

    expect(given.patterns).toEqual(["outbox"]);
    expect(none.patterns).toEqual([]);
    await expect(
      collectOptions(
        { name: "shop", choices: {}, yes: true, patterns: ["saga"] },
        environment([]).env,
      ),
    ).rejects.toThrow('Unknown pattern "saga"');
    await expect(
      collectOptions(
        { name: "shop", choices: {}, yes: true, patterns: ["outbox", "outbox"] },
        environment([]).env,
      ),
    ).rejects.toThrow("more than once");
  });
});
