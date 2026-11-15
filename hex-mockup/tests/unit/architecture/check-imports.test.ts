import { describe, expect, it } from "vitest";
import { checkImports } from "../../helpers/architecture.ts";

const AUTH = "src/modules/auth";
const USERS = "src/modules/users";

/** Reglas que incumple un único archivo con un único import. */
function rulesOf(file: string, source: string): string[] {
  return checkImports({ [file]: source }).map((violation) => violation.rule);
}

describe("checkImports", () => {
  it("no encuentra violaciones en un módulo bien formado", () => {
    const files = {
      [`${AUTH}/domain/entities/token.ts`]: `
        import { randomUUID } from "node:crypto";
        import { AppError } from "../../../../shared/errors/app-error.ts";
        import type { Clock } from "../services/clock.ts";`,
      [`${AUTH}/application/use-cases/login.use-case.ts`]: `
        import type { Token } from "../../domain/entities/token.ts";
        import type { Hasher } from "../ports/hasher.ts";
        import type { User } from "../../../users/domain/entities/user.entity.ts";
        import { toPublicUser } from "../../../users/application/public-user.ts";`,
      [`${AUTH}/presentation/routes/auth.routes.ts`]: `
        import { Router } from "express";
        import { z } from "zod";
        import { parseBody } from "../../../../shared/http/validate.ts";
        import type { Login } from "../../application/use-cases/login.use-case.ts";
        import { controller } from "../controllers/auth.controller.ts";`,
      [`${AUTH}/infrastructure/database/prisma-token.repository.ts`]: `
        import type { PrismaClient } from "../../../../generated/prisma/client.ts";
        import type { Token } from "../../domain/entities/token.ts";
        import type { Hasher } from "../../application/ports/hasher.ts";
        import { hash } from "@node-rs/argon2";`,
      "src/shared/http/problem.ts": `
        import type { Response } from "express";
        import { AppError } from "../errors/app-error.ts";`,
      "src/composition.ts": `
        import { PrismaClient } from "./generated/prisma/client.ts";
        import { PrismaPg } from "@prisma/adapter-pg";
        import { PrismaTokenRepository } from "./modules/auth/infrastructure/database/prisma-token.repository.ts";
        import { authRoutes } from "./modules/auth/presentation/routes/auth.routes.ts";`,
    };

    expect(checkImports(files)).toEqual([]);
  });

  it("devuelve el archivo, el import y la regla de cada violación", () => {
    const file = `${AUTH}/application/use-cases/login.use-case.ts`;
    const imported = "../../infrastructure/security/argon2-hasher.ts";

    expect(checkImports({ [file]: `import { Argon2 } from "${imported}";` })).toEqual([
      { file, imported, rule: "R2" },
    ]);
  });

  describe("R1: el dominio solo importa dominio, shared y node:*", () => {
    const file = `${AUTH}/domain/entities/token.ts`;

    it.each([
      ["la aplicación", "../../application/ports/hasher.ts"],
      ["la infraestructura", "../../infrastructure/security/argon2-hasher.ts"],
      ["la presentación", "../../presentation/schemas/auth.schemas.ts"],
      ["la configuración", "../../../../config/env.ts"],
      ["una librería externa cualquiera", "lodash"],
    ])("rechaza %s", (_name, specifier) => {
      expect(rulesOf(file, `import x from "${specifier}";`)).toEqual(["R1"]);
    });

    it("acepta el dominio de otro módulo", () => {
      expect(
        rulesOf(file, `import type { User } from "../../../users/domain/entities/user.entity.ts";`),
      ).toEqual([]);
    });
  });

  describe("R2: la aplicación nunca importa infraestructura ni presentación", () => {
    const file = `${AUTH}/application/use-cases/login.use-case.ts`;

    it.each([
      ["la infraestructura", "../../infrastructure/security/argon2-hasher.ts"],
      ["la presentación", "../../presentation/cookies/refresh-cookie.ts"],
      [
        "la infraestructura de otro módulo",
        "../../../users/infrastructure/database/prisma-user.repository.ts",
      ],
      ["la raíz de composición", "../../../../composition.ts"],
    ])("rechaza %s", (_name, specifier) => {
      expect(rulesOf(file, `import x from "${specifier}";`)).toEqual(["R2"]);
    });
  });

  describe("R3: la presentación nunca importa infraestructura", () => {
    it("rechaza un adaptador de su propio módulo", () => {
      const file = `${AUTH}/presentation/controllers/auth.controller.ts`;
      const specifier = "../../infrastructure/security/jose-token-service.ts";

      expect(rulesOf(file, `import { Jose } from "${specifier}";`)).toEqual(["R3"]);
    });
  });

  describe("R4: la infraestructura nunca importa presentación", () => {
    it("rechaza un esquema de la capa de presentación", () => {
      const file = `${AUTH}/infrastructure/database/prisma-token.repository.ts`;
      const specifier = "../../presentation/schemas/auth.schemas.ts";

      expect(rulesOf(file, `import { schema } from "${specifier}";`)).toEqual(["R4"]);
    });
  });

  describe("R5: shared nunca importa de los módulos", () => {
    it("rechaza cualquier capa de un módulo, incluido el dominio", () => {
      const file = "src/shared/http/problem.ts";
      const specifier = "../../modules/users/domain/entities/user.entity.ts";

      expect(rulesOf(file, `import type { User } from "${specifier}";`)).toEqual(["R5"]);
    });
  });

  describe("R6: src/generated solo lo importan la infraestructura y composition.ts", () => {
    const specifier = "../../../../generated/prisma/client.ts";

    it.each([
      ["el dominio", `${AUTH}/domain/entities/token.ts`],
      ["la aplicación", `${AUTH}/application/use-cases/login.use-case.ts`],
      ["la presentación", `${AUTH}/presentation/controllers/auth.controller.ts`],
    ])("rechaza que lo importe %s", (_name, file) => {
      expect(rulesOf(file, `import type { PrismaClient } from "${specifier}";`)).toEqual(["R6"]);
    });

    it("rechaza que lo importen shared, app.ts o main.ts", () => {
      const source = (path: string) => `import { PrismaClient } from "${path}";`;

      expect(rulesOf("src/shared/scheduler.ts", source("../generated/prisma/client.ts"))).toEqual([
        "R6",
      ]);
      expect(rulesOf("src/app.ts", source("./generated/prisma/client.ts"))).toEqual(["R6"]);
      expect(rulesOf("src/main.ts", source("./generated/prisma/client.ts"))).toEqual(["R6"]);
    });
  });

  describe("R7: dominio y aplicación no importan librerías de web, BD, log ni cripto", () => {
    const libraries = [
      "express",
      "cors",
      "helmet",
      "cookie-parser",
      "express-rate-limit",
      "@prisma/client",
      "@prisma/adapter-pg",
      "pg",
      "pino",
      "pino-http",
      "jose",
      "@node-rs/argon2",
      "zod",
      "zod/v4",
    ];

    it.each(libraries)("rechaza %s en el dominio", (library) => {
      const file = `${USERS}/domain/entities/user.entity.ts`;

      expect(rulesOf(file, `import x from "${library}";`)).toEqual(["R7"]);
    });

    it.each(libraries)("rechaza %s en la aplicación", (library) => {
      const file = `${AUTH}/application/use-cases/login.use-case.ts`;

      expect(rulesOf(file, `import x from "${library}";`)).toEqual(["R7"]);
    });

    it("no confunde un paquete cuyo nombre solo empieza igual", () => {
      const file = `${AUTH}/application/use-cases/login.use-case.ts`;

      expect(rulesOf(file, `import x from "pgvector";`)).toEqual([]);
    });
  });

  describe("R8: dominio y aplicación no importan shared/http", () => {
    const specifier = "../../../../shared/http/rate-limit.ts";

    it.each([
      ["el dominio", `${AUTH}/domain/services/password-policy.ts`],
      ["la aplicación", `${AUTH}/application/use-cases/login.use-case.ts`],
    ])("rechaza que lo importe %s", (_name, file) => {
      expect(rulesOf(file, `import { createRateLimiter } from "${specifier}";`)).toEqual(["R8"]);
    });

    it("acepta el resto de shared en dominio y aplicación", () => {
      const file = `${AUTH}/application/use-cases/login.use-case.ts`;
      const source = `
        import { AppError } from "../../../../shared/errors/app-error.ts";
        import type { Locale } from "../../../../shared/i18n/locale.ts";
        import { definePermissions } from "../../../../shared/permissions/permission.ts";`;

      expect(rulesOf(file, source)).toEqual([]);
    });

    it("acepta shared/http en presentación e infraestructura", () => {
      const source = `import { createRateLimiter } from "${specifier}";`;

      expect(rulesOf(`${AUTH}/presentation/routes/auth.routes.ts`, source)).toEqual([]);
      expect(rulesOf(`${AUTH}/infrastructure/security/limiter.ts`, source)).toEqual([]);
    });
  });

  describe("R9: src/config solo lo importan main.ts, composition.ts y src/cli", () => {
    it.each([
      [
        "la presentación",
        `${AUTH}/presentation/routes/auth.routes.ts`,
        "../../../../config/env.ts",
      ],
      [
        "la infraestructura",
        `${AUTH}/infrastructure/security/jose.ts`,
        "../../../../config/env.ts",
      ],
      ["shared", "src/shared/http/http-logger.ts", "../../config/env.ts"],
      ["app.ts", "src/app.ts", "./config/env.ts"],
    ])("rechaza que lo importe %s", (_name, file, specifier) => {
      expect(rulesOf(file, `import { loadEnv } from "${specifier}";`)).toEqual(["R9"]);
    });

    it.each([
      ["main.ts", "src/main.ts", "./config/env.ts"],
      ["composition.ts", "src/composition.ts", "./config/env.ts"],
      ["un comando de src/cli", "src/cli/create-admin.ts", "../config/env.ts"],
      ["otro archivo de config", "src/config/logger.ts", "./env.ts"],
    ])("acepta que lo importe %s", (_name, file, specifier) => {
      expect(rulesOf(file, `import { loadEnv } from "${specifier}";`)).toEqual([]);
    });

    it("en dominio y aplicación sigue mandando la regla de su capa", () => {
      const source = `import { loadEnv } from "../../../../config/env.ts";`;

      expect(rulesOf(`${AUTH}/domain/entities/token.ts`, source)).toEqual(["R1"]);
      expect(rulesOf(`${AUTH}/application/use-cases/login.use-case.ts`, source)).toEqual(["R2"]);
    });
  });

  describe("entre módulos solo se consume dominio y aplicación", () => {
    it("rechaza la presentación de otro módulo desde la presentación", () => {
      const file = `${AUTH}/presentation/routes/auth.routes.ts`;
      const specifier = "../../../users/presentation/controllers/users.controller.ts";

      expect(rulesOf(file, `import { c } from "${specifier}";`)).toEqual(["CROSS_MODULE"]);
    });

    it("rechaza la infraestructura de otro módulo desde la infraestructura", () => {
      const file = `${AUTH}/infrastructure/database/prisma-token.repository.ts`;
      const specifier = "../../../users/infrastructure/database/prisma-user.repository.ts";

      expect(rulesOf(file, `import { r } from "${specifier}";`)).toEqual(["CROSS_MODULE"]);
    });

    it("acepta la infraestructura del propio módulo", () => {
      const file = `${AUTH}/infrastructure/database/prisma-token.repository.ts`;

      expect(rulesOf(file, `import { map } from "./token.mapper.ts";`)).toEqual([]);
    });
  });

  describe("formas de import", () => {
    const file = `${AUTH}/application/use-cases/login.use-case.ts`;
    const forbidden = "../../infrastructure/security/argon2-hasher.ts";

    it.each([
      ["import con nombre", `import { a } from "${forbidden}";`],
      ["import de tipos", `import type { A } from '${forbidden}';`],
      ["import de varias líneas", `import {\n  a,\n  b,\n} from "${forbidden}";`],
      ["import sin enlaces", `import "${forbidden}";`],
      ["import dinámico", `const m = await import("${forbidden}");`],
      ["reexportación", `export * from "${forbidden}";`],
      ["reexportación con nombre", `export { a } from "${forbidden}";`],
    ])("detecta un %s", (_name, source) => {
      expect(rulesOf(file, source)).toEqual(["R2"]);
    });

    it("ignora los imports que están dentro de comentarios", () => {
      const source = `
        // import { a } from "${forbidden}";
        /* import { b } from "${forbidden}"; */
        /**
         * import { c } from "${forbidden}";
         */
        export const login = 1;`;

      expect(rulesOf(file, source)).toEqual([]);
    });

    it("informa todas las violaciones de un archivo", () => {
      const source = `
        import { a } from "${forbidden}";
        import express from "express";`;

      expect(rulesOf(file, source)).toEqual(["R2", "R7"]);
    });
  });

  it("ignora los archivos que están fuera de src", () => {
    const source = `import { a } from "../src/modules/auth/infrastructure/security/argon2-hasher.ts";`;

    expect(checkImports({ "tests/helpers/fakes.ts": source })).toEqual([]);
  });
});
