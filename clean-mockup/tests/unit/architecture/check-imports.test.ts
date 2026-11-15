import { describe, expect, it } from "vitest";
import { checkImports } from "../../helpers/architecture.ts";

const ENTITY = "src/entities/user.ts";
const USE_CASE = "src/use-cases/auth/log-in.use-case.ts";
const CONTROLLER = "src/interface-adapters/controllers/auth.controller.ts";
const ROUTES = "src/frameworks/express/routes/auth.routes.ts";
const REPOSITORY = "src/frameworks/database/prisma-user.repository.ts";
const COMPOSITION = "src/composition.ts";

/** Reglas que incumple un único archivo. */
function rulesOf(file: string, source: string): string[] {
  return checkImports({ [file]: source }).map((violation) => violation.rule);
}

describe("checkImports", () => {
  it("no encuentra violaciones en un proyecto bien formado", () => {
    const files = {
      [ENTITY]: `
        import { randomUUID } from "node:crypto";
        import { AppError } from "./errors/app-error.ts";
        import type { Locale } from "./locale.ts";`,
      [USE_CASE]: `
        import { AppError } from "../../entities/errors/app-error.ts";
        import type { User } from "../../entities/user.ts";
        import type { UseCase } from "../use-case.ts";
        import type { UserRepository } from "../users/ports/user.repository.ts";
        import type { PasswordHasher } from "./ports/password-hasher.ts";`,
      [CONTROLLER]: `
        import { z } from "zod";
        import { AppError } from "../../entities/errors/app-error.ts";
        import type { LogInRequest } from "../../use-cases/auth/log-in.use-case.ts";
        import type { UseCase } from "../../use-cases/use-case.ts";
        import { type Controller, ok } from "../http/http.ts";
        import { presentSession } from "../presenters/session.presenter.ts";`,
      [ROUTES]: `
        import { Router } from "express";
        import { createAuthController } from "../../../interface-adapters/controllers/auth.controller.ts";
        import type { UseCase } from "../../../use-cases/use-case.ts";
        import { adapt } from "../adapt.ts";`,
      [REPOSITORY]: `
        import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
        import { User } from "../../entities/user.ts";
        import type { UserRepository } from "../../use-cases/users/ports/user.repository.ts";`,
      [COMPOSITION]: `
        import { PrismaPg } from "@prisma/adapter-pg";
        import { PrismaClient } from "./generated/prisma/client.ts";
        import { PrismaUserRepository } from "./frameworks/database/prisma-user.repository.ts";
        import { createAuthRouter } from "./frameworks/express/routes/auth.routes.ts";
        import { LogIn } from "./use-cases/auth/log-in.use-case.ts";
        import type { Env } from "./config/env.ts";`,
    };

    expect(checkImports(files)).toEqual([]);
  });

  it("devuelve el archivo, el import y la regla de cada violación", () => {
    const imported = "../../frameworks/security/argon2-password-hasher.ts";

    expect(checkImports({ [USE_CASE]: `import { Argon2 } from "${imported}";` })).toEqual([
      { file: USE_CASE, imported, rule: "R2" },
    ]);
  });

  describe("R1: las entidades solo importan entidades", () => {
    it.each([
      ["un caso de uso", "../use-cases/auth/log-in.use-case.ts"],
      ["un puerto", "../use-cases/users/ports/user.repository.ts"],
      ["un adaptador de interfaz", "../interface-adapters/http/http.ts"],
      ["un framework", "../frameworks/database/prisma-user.repository.ts"],
      ["la composición", "../composition.ts"],
    ])("rechaza %s", (_name, specifier) => {
      expect(rulesOf(ENTITY, `import type { X } from "${specifier}";`)).toEqual(["R1"]);
    });

    it("acepta otras entidades, sus reglas y node:*", () => {
      const source = `
        import { createHash } from "node:crypto";
        import { assertPasswordPolicy } from "./rules/password-policy.ts";
        import { AppError } from "./errors/app-error.ts";`;

      expect(rulesOf(ENTITY, source)).toEqual([]);
    });
  });

  describe("R2: los casos de uso solo importan entidades y casos de uso", () => {
    it.each([
      ["un controlador", "../../interface-adapters/controllers/auth.controller.ts"],
      ["un presentador", "../../interface-adapters/presenters/problem.ts"],
      ["un repositorio concreto", "../../frameworks/database/prisma-user.repository.ts"],
      ["Express", "../../frameworks/express/app.ts"],
      ["la configuración", "../../config/env.ts"],
      ["un comando de la terminal", "../../cli/create-admin.ts"],
    ])("rechaza %s", (_name, specifier) => {
      expect(rulesOf(USE_CASE, `import { x } from "${specifier}";`)).toEqual(["R2"]);
    });

    it("acepta los casos de uso y los puertos de otra funcionalidad", () => {
      const source = `
        import type { GetUser } from "../users/get-user.use-case.ts";
        import type { UserRepository } from "../users/ports/user.repository.ts";
        import type { PermissionRegistry } from "../permissions/permission.ts";`;

      expect(rulesOf(USE_CASE, source)).toEqual([]);
    });
  });

  describe("R3: los adaptadores de interfaz no importan frameworks ni main", () => {
    it.each([
      ["el adaptador de Express", "../../frameworks/express/adapt.ts"],
      ["un repositorio concreto", "../../frameworks/database/prisma-user.repository.ts"],
      ["la composición", "../../composition.ts"],
      ["la configuración", "../../config/env.ts"],
    ])("rechaza %s", (_name, specifier) => {
      expect(rulesOf(CONTROLLER, `import type { X } from "${specifier}";`)).toEqual(["R3"]);
    });
  });

  describe("R4: los frameworks no importan main (main.ts, composition.ts, config/, cli/)", () => {
    it.each([
      ["Express", ROUTES],
      ["la base de datos", REPOSITORY],
      ["un archivo suelto de frameworks", "src/frameworks/scheduler.ts"],
    ])("rechaza que %s lea la configuración o la composición", (_name, file) => {
      const up =
        file.split("/").length === 3 ? ".." : file.includes("/routes/") ? "../../.." : "../..";

      expect(rulesOf(file, `import { loadEnv } from "${up}/config/env.ts";`)).toEqual(["R4"]);
      expect(rulesOf(file, `import { composeApp } from "${up}/composition.ts";`)).toEqual(["R4"]);
    });

    it("main sí importa de todas las capas", () => {
      const source = `
        import { User } from "./entities/user.ts";
        import { LogIn } from "./use-cases/auth/log-in.use-case.ts";
        import { createAuthController } from "./interface-adapters/controllers/auth.controller.ts";
        import { createApp } from "./frameworks/express/app.ts";
        import { loadEnv } from "./config/env.ts";`;

      expect(rulesOf(COMPOSITION, source)).toEqual([]);
    });
  });

  describe("R5: entidades y casos de uso no importan ninguna librería externa", () => {
    const libraries = [
      "express",
      "zod",
      "@prisma/client",
      "pino",
      "jose",
      "@node-rs/argon2",
      "lodash",
    ];

    it.each(libraries)("rechaza %s en una entidad", (library) => {
      expect(rulesOf(ENTITY, `import x from "${library}";`)).toEqual(["R5"]);
    });

    it.each(libraries)("rechaza %s en un caso de uso", (library) => {
      expect(rulesOf(USE_CASE, `import x from "${library}";`)).toEqual(["R5"]);
    });

    it("acepta los módulos nativos de Node", () => {
      expect(rulesOf(USE_CASE, `import { randomUUID } from "node:crypto";`)).toEqual([]);
    });
  });

  describe("R6: los adaptadores de interfaz solo usan zod como librería externa", () => {
    it.each(["express", "cookie-parser", "@prisma/client", "pino", "jose", "helmet"])(
      "rechaza %s",
      (library) => {
        expect(rulesOf(CONTROLLER, `import type { X } from "${library}";`)).toEqual(["R6"]);
      },
    );

    it.each(["zod", "zod/v4"])("acepta %s", (library) => {
      expect(rulesOf(CONTROLLER, `import { z } from "${library}";`)).toEqual([]);
    });

    it("no confunde un paquete cuyo nombre solo empieza igual", () => {
      expect(rulesOf(CONTROLLER, `import x from "zod-to-json-schema";`)).toEqual(["R6"]);
    });

    it("los frameworks y main usan las librerías que necesiten", () => {
      expect(rulesOf(ROUTES, `import { Router } from "express";`)).toEqual([]);
      expect(rulesOf(COMPOSITION, `import pino from "pino";`)).toEqual([]);
    });
  });

  describe("R7: src/generated solo lo importan frameworks/database y main", () => {
    it.each([
      ["una entidad", ENTITY, "../generated/prisma/client.ts"],
      ["un caso de uso", USE_CASE, "../../generated/prisma/client.ts"],
      ["un controlador", CONTROLLER, "../../generated/prisma/client.ts"],
      ["Express", ROUTES, "../../../generated/prisma/client.ts"],
      ["otro framework", "src/frameworks/security/jose.ts", "../../generated/prisma/client.ts"],
    ])("rechaza que lo importe %s", (_name, file, specifier) => {
      expect(rulesOf(file, `import type { PrismaClient } from "${specifier}";`)).toEqual(["R7"]);
    });

    it("acepta que lo importen los repositorios y la composición", () => {
      expect(
        rulesOf(
          REPOSITORY,
          `import type { PrismaClient } from "../../generated/prisma/client.ts";`,
        ),
      ).toEqual([]);
      expect(
        rulesOf(COMPOSITION, `import { PrismaClient } from "./generated/prisma/client.ts";`),
      ).toEqual([]);
    });
  });

  describe("R8: los detalles no se conocen entre sí", () => {
    it.each([
      ["Express", ROUTES, "la base de datos", "../../database/prisma-user.repository.ts"],
      ["la base de datos", REPOSITORY, "Express", "../express/app.ts"],
      ["la base de datos", REPOSITORY, "la criptografía", "../security/argon2-password-hasher.ts"],
    ])("rechaza que %s importe %s", (_source, file, _target, specifier) => {
      expect(rulesOf(file, `import { x } from "${specifier}";`)).toEqual(["R8"]);
    });

    it("acepta los imports dentro del mismo detalle", () => {
      const source = `
        import { adapt } from "../adapt.ts";
        import { requireAuth } from "../middlewares/require-auth.ts";`;

      expect(rulesOf(ROUTES, source)).toEqual([]);
    });
  });

  describe("R9: los adaptadores de interfaz solo importan tipos de los casos de uso", () => {
    it.each([
      [
        "la clase de un caso de uso",
        `import { LogIn } from "../../use-cases/auth/log-in.use-case.ts";`,
      ],
      [
        "una función de un caso de uso",
        `import { toPublicUser } from "../../use-cases/users/public-user.ts";`,
      ],
      [
        "un import mixto de valor y tipo",
        `import { LogIn, type LogInRequest } from "../../use-cases/auth/log-in.use-case.ts";`,
      ],
    ])("rechaza %s", (_name, source) => {
      expect(rulesOf(CONTROLLER, source)).toEqual(["R9"]);
    });

    it.each([
      ["un import de tipos", `import type { UseCase } from "../../use-cases/use-case.ts";`],
      [
        "un import de tipos de varias líneas",
        `import type {\n  LogInRequest,\n  LogInResponse,\n} from "../../use-cases/auth/log-in.use-case.ts";`,
      ],
    ])("acepta %s", (_name, source) => {
      expect(rulesOf(CONTROLLER, source)).toEqual([]);
    });

    it("los adaptadores sí pueden usar valores de las entidades", () => {
      const source = `import { AppError } from "../../entities/errors/app-error.ts";`;

      expect(rulesOf(CONTROLLER, source)).toEqual([]);
    });

    it("los frameworks y main sí crean y usan casos de uso", () => {
      const source = (up: string) =>
        `import { checkLiveness } from "${up}/use-cases/health/check-liveness.use-case.ts";`;

      expect(rulesOf("src/frameworks/express/routes/health.routes.ts", source("../../.."))).toEqual(
        [],
      );
      expect(rulesOf(COMPOSITION, source("."))).toEqual([]);
    });
  });

  describe("formas de import", () => {
    const forbidden = "../../frameworks/security/argon2-password-hasher.ts";

    it.each([
      ["import con nombre", `import { a } from "${forbidden}";`],
      ["import de tipos", `import type { A } from '${forbidden}';`],
      ["import de varias líneas", `import {\n  a,\n  b,\n} from "${forbidden}";`],
      ["import sin enlaces", `import "${forbidden}";`],
      ["import dinámico", `const m = await import("${forbidden}");`],
      ["reexportación", `export * from "${forbidden}";`],
      ["reexportación con nombre", `export { a } from "${forbidden}";`],
    ])("detecta un %s", (_name, source) => {
      expect(rulesOf(USE_CASE, source)).toEqual(["R2"]);
    });

    it("ignora los imports que están dentro de comentarios", () => {
      const source = `
        // import { a } from "${forbidden}";
        /* import { b } from "${forbidden}"; */
        /**
         * import { c } from "${forbidden}";
         */
        export const logIn = 1;`;

      expect(rulesOf(USE_CASE, source)).toEqual([]);
    });

    it("informa todas las violaciones de un archivo", () => {
      const source = `
        import { a } from "${forbidden}";
        import express from "express";`;

      expect(rulesOf(USE_CASE, source)).toEqual(["R2", "R5"]);
    });

    it("un import de tipos no convierte en tipos al import siguiente", () => {
      const source = `
        import type { UseCase } from "../../use-cases/use-case.ts";
        import { LogIn } from "../../use-cases/auth/log-in.use-case.ts";`;

      expect(rulesOf(CONTROLLER, source)).toEqual(["R9"]);
    });
  });

  describe("la capa main", () => {
    it.each(["src/main.ts", "src/composition.ts", "src/config/env.ts", "src/cli/create-admin.ts"])(
      "%s puede importar de todas las capas y usar librerías",
      (file) => {
        const up = file.split("/").length === 2 ? "." : "..";
        const source = `
          import pino from "pino";
          import { createApp } from "${up}/frameworks/express/app.ts";
          import { LogIn } from "${up}/use-cases/auth/log-in.use-case.ts";`;

        expect(rulesOf(file, source)).toEqual([]);
      },
    );

    it("lo que no está en ninguna capa solo puede importarlo main", () => {
      const stray = (up: string) => `import { helper } from "${up}/utils/helper.ts";`;

      expect(rulesOf(ENTITY, stray(".."))).toEqual(["R1"]);
      expect(rulesOf(USE_CASE, stray("../.."))).toEqual(["R2"]);
      expect(rulesOf(CONTROLLER, stray("../.."))).toEqual(["R3"]);
      expect(rulesOf(REPOSITORY, stray("../.."))).toEqual(["R4"]);
      expect(rulesOf(COMPOSITION, stray("."))).toEqual([]);
    });
  });

  it("ignora los archivos que están fuera de src", () => {
    const source = `import { a } from "../src/frameworks/security/argon2-password-hasher.ts";`;

    expect(checkImports({ "tests/helpers/fakes.ts": source })).toEqual([]);
  });
});
