import { describe, expect, it } from "vitest";
import { checkImports } from "../../helpers/architecture.ts";

const IDENTITY = "src/contexts/identity";
const CATALOG = "src/contexts/catalog";
const HEALTH = "src/platform/health";

/** Reglas que incumple un único archivo con un único import. */
function rulesOf(file: string, source: string): string[] {
  return checkImports({ [file]: source }).map((violation) => violation.rule);
}

describe("checkImports", () => {
  it("no encuentra violaciones en un contexto bien formado", () => {
    const files = {
      [`${IDENTITY}/domain/aggregates/session.ts`]: `
        import { randomUUID } from "node:crypto";
        import { AggregateRoot } from "../../../../shared/domain/aggregate-root.ts";
        import type { SessionStarted } from "../events/session-started.ts";
        import { Email } from "../value-objects/email.ts";
        import { assertPolicy } from "../services/session-policy.ts";`,
      [`${IDENTITY}/domain/value-objects/email.ts`]: `
        import { AppError } from "../../../../shared/errors/app-error.ts";`,
      [`${IDENTITY}/domain/events/session-started.ts`]: `
        import type { DomainEvent } from "../../../../shared/domain/domain-event.ts";
        import type { Email } from "../value-objects/email.ts";`,
      [`${IDENTITY}/application/event-handlers/notify-new-session.ts`]: `
        import type { EventHandler } from "../../../../shared/events/event-bus.ts";
        import type { SessionStarted } from "../../domain/events/session-started.ts";
        import type { Notifier } from "../ports/notifier.ts";`,
      [`${IDENTITY}/application/commands/login.command.ts`]: `
        import type { Session } from "../../domain/aggregates/session.ts";
        import type { Hasher } from "../ports/hasher.ts";
        import type { GetProduct } from "../../../catalog/application/queries/get-product.query.ts";
        import type { ProductView } from "../../../catalog/application/dtos/product-view.ts";`,
      [`${IDENTITY}/presentation/routes/auth.routes.ts`]: `
        import { Router } from "express";
        import { z } from "zod";
        import { parseBody } from "../../../../shared/http/validate.ts";
        import type { Login } from "../../application/commands/login.command.ts";
        import { controller } from "../controllers/auth.controller.ts";`,
      [`${IDENTITY}/infrastructure/database/prisma-session.repository.ts`]: `
        import type { PrismaClient } from "../../../../generated/prisma/client.ts";
        import type { Session } from "../../domain/aggregates/session.ts";
        import type { Hasher } from "../../application/ports/hasher.ts";
        import { hash } from "@node-rs/argon2";`,
      "src/shared/http/problem.ts": `
        import type { Response } from "express";
        import { AppError } from "../errors/app-error.ts";`,
      "src/composition.ts": `
        import { PrismaClient } from "./generated/prisma/client.ts";
        import { PrismaPg } from "@prisma/adapter-pg";
        import { PrismaSessionRepository } from "./contexts/identity/infrastructure/database/prisma-session.repository.ts";
        import { authRoutes } from "./contexts/identity/presentation/routes/auth.routes.ts";`,
    };

    expect(checkImports(files)).toEqual([]);
  });

  it("devuelve el archivo, el import y la regla de cada violación", () => {
    const file = `${IDENTITY}/application/commands/login.command.ts`;
    const imported = "../../infrastructure/security/argon2-hasher.ts";

    expect(checkImports({ [file]: `import { Argon2 } from "${imported}";` })).toEqual([
      { file, imported, rule: "R2" },
    ]);
  });

  describe("R1: el dominio solo importa dominio, shared y node:*", () => {
    const file = `${IDENTITY}/domain/aggregates/session.ts`;

    it.each([
      ["la aplicación", "../../application/ports/hasher.ts"],
      ["la infraestructura", "../../infrastructure/security/argon2-hasher.ts"],
      ["la presentación", "../../presentation/schemas/auth.schemas.ts"],
      ["la configuración", "../../../../config/env.ts"],
      ["una librería externa cualquiera", "lodash"],
    ])("rechaza %s", (_name, specifier) => {
      expect(rulesOf(file, `import x from "${specifier}";`)).toEqual(["R1"]);
    });

    it("acepta el resto de su propio dominio y el núcleo compartido", () => {
      const source = `
        import { Email } from "../value-objects/email.ts";
        import type { SessionRepository } from "../repositories/session.repository.ts";
        import { AggregateRoot } from "../../../../shared/domain/aggregate-root.ts";
        import { randomUUID } from "node:crypto";`;

      expect(rulesOf(file, source)).toEqual([]);
    });
  });

  describe("R2: la aplicación nunca importa infraestructura ni presentación", () => {
    const file = `${IDENTITY}/application/commands/login.command.ts`;

    it.each([
      ["la infraestructura", "../../infrastructure/security/argon2-hasher.ts"],
      ["la presentación", "../../presentation/cookies/refresh-cookie.ts"],
      [
        "la infraestructura de otro contexto",
        "../../../catalog/infrastructure/database/prisma-user.repository.ts",
      ],
      ["la raíz de composición", "../../../../composition.ts"],
    ])("rechaza %s", (_name, specifier) => {
      expect(rulesOf(file, `import x from "${specifier}";`)).toEqual(["R2"]);
    });
  });

  describe("R3: la presentación nunca importa infraestructura", () => {
    it("rechaza un adaptador de su propio contexto", () => {
      const file = `${IDENTITY}/presentation/controllers/auth.controller.ts`;
      const specifier = "../../infrastructure/security/jose-token-service.ts";

      expect(rulesOf(file, `import { Jose } from "${specifier}";`)).toEqual(["R3"]);
    });
  });

  describe("R4: la infraestructura nunca importa presentación", () => {
    it("rechaza un esquema de la capa de presentación", () => {
      const file = `${IDENTITY}/infrastructure/database/prisma-session.repository.ts`;
      const specifier = "../../presentation/schemas/auth.schemas.ts";

      expect(rulesOf(file, `import { schema } from "${specifier}";`)).toEqual(["R4"]);
    });
  });

  describe("R5: shared nunca importa de los contextos ni de platform", () => {
    it.each([
      ["el dominio de un contexto", "../../contexts/catalog/domain/aggregates/product.ts"],
      ["la aplicación de un contexto", "../../contexts/catalog/application/dtos/product-view.ts"],
      ["una capacidad de platform", "../../platform/health/application/ports/readiness-probe.ts"],
    ])("rechaza %s", (_name, specifier) => {
      expect(rulesOf("src/shared/http/problem.ts", `import x from "${specifier}";`)).toEqual([
        "R5",
      ]);
    });
  });

  describe("R6: src/generated solo lo importan la infraestructura y composition.ts", () => {
    const specifier = "../../../../generated/prisma/client.ts";

    it.each([
      ["el dominio", `${IDENTITY}/domain/aggregates/session.ts`],
      ["la aplicación", `${IDENTITY}/application/commands/login.command.ts`],
      ["la presentación", `${IDENTITY}/presentation/controllers/auth.controller.ts`],
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
      const file = `${CATALOG}/domain/aggregates/product.ts`;

      expect(rulesOf(file, `import x from "${library}";`)).toEqual(["R7"]);
    });

    it.each(libraries)("rechaza %s en la aplicación", (library) => {
      const file = `${IDENTITY}/application/commands/login.command.ts`;

      expect(rulesOf(file, `import x from "${library}";`)).toEqual(["R7"]);
    });

    it("no confunde un paquete cuyo nombre solo empieza igual", () => {
      const file = `${IDENTITY}/application/commands/login.command.ts`;

      expect(rulesOf(file, `import x from "pgvector";`)).toEqual([]);
    });
  });

  describe("R8: dominio y aplicación no importan shared/http", () => {
    const specifier = "../../../../shared/http/rate-limit.ts";

    it.each([
      ["el dominio", `${IDENTITY}/domain/services/password-policy.ts`],
      ["la aplicación", `${IDENTITY}/application/commands/login.command.ts`],
    ])("rechaza que lo importe %s", (_name, file) => {
      expect(rulesOf(file, `import { createRateLimiter } from "${specifier}";`)).toEqual(["R8"]);
    });

    it("acepta el resto de shared en dominio y aplicación", () => {
      const file = `${IDENTITY}/application/commands/login.command.ts`;
      const source = `
        import { AppError } from "../../../../shared/errors/app-error.ts";
        import type { Locale } from "../../../../shared/i18n/locale.ts";
        import { definePermissions } from "../../../../shared/permissions/permission.ts";`;

      expect(rulesOf(file, source)).toEqual([]);
    });

    it("acepta shared/http en presentación e infraestructura", () => {
      const source = `import { createRateLimiter } from "${specifier}";`;

      expect(rulesOf(`${IDENTITY}/presentation/routes/auth.routes.ts`, source)).toEqual([]);
      expect(rulesOf(`${IDENTITY}/infrastructure/security/limiter.ts`, source)).toEqual([]);
    });
  });

  describe("R9: src/config solo lo importan main.ts, composition.ts y src/cli", () => {
    it.each([
      [
        "la presentación",
        `${IDENTITY}/presentation/routes/auth.routes.ts`,
        "../../../../config/env.ts",
      ],
      [
        "la infraestructura",
        `${IDENTITY}/infrastructure/security/jose.ts`,
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

      expect(rulesOf(`${IDENTITY}/domain/aggregates/session.ts`, source)).toEqual(["R1"]);
      expect(rulesOf(`${IDENTITY}/application/commands/login.command.ts`, source)).toEqual(["R2"]);
    });
  });

  describe("R10: de otro contexto solo se importa su capa de aplicación", () => {
    it.each([
      ["el dominio", `${IDENTITY}/domain/aggregates/session.ts`],
      ["la aplicación", `${IDENTITY}/application/commands/login.command.ts`],
      ["la infraestructura", `${IDENTITY}/infrastructure/database/prisma-session.repository.ts`],
      ["la presentación", `${IDENTITY}/presentation/controllers/auth.controller.ts`],
    ])("rechaza el dominio de otro contexto desde %s", (_name, file) => {
      const specifier = "../../../catalog/domain/aggregates/product.ts";

      expect(rulesOf(file, `import type { Product } from "${specifier}";`)).toEqual(["R10"]);
    });

    it("rechaza la presentación de otro contexto desde la presentación", () => {
      const file = `${IDENTITY}/presentation/routes/auth.routes.ts`;
      const specifier = "../../../catalog/presentation/controllers/products.controller.ts";

      expect(rulesOf(file, `import { c } from "${specifier}";`)).toEqual(["R10"]);
    });

    it("rechaza la infraestructura de otro contexto desde la infraestructura", () => {
      const file = `${IDENTITY}/infrastructure/database/prisma-session.repository.ts`;
      const specifier = "../../../catalog/infrastructure/database/prisma-product.repository.ts";

      expect(rulesOf(file, `import { r } from "${specifier}";`)).toEqual(["R10"]);
    });

    it.each([
      ["la aplicación", `${IDENTITY}/application/commands/login.command.ts`],
      ["la infraestructura", `${IDENTITY}/infrastructure/database/prisma-session.repository.ts`],
      ["la presentación", `${IDENTITY}/presentation/controllers/auth.controller.ts`],
    ])("acepta la aplicación de otro contexto desde %s", (_name, file) => {
      const specifier = "../../../catalog/application/queries/get-product.query.ts";

      expect(rulesOf(file, `import type { GetProduct } from "${specifier}";`)).toEqual([]);
    });

    it("el dominio tampoco importa la aplicación de otro contexto (manda R1)", () => {
      const file = `${IDENTITY}/domain/aggregates/session.ts`;
      const specifier = "../../../catalog/application/queries/get-product.query.ts";

      expect(rulesOf(file, `import type { GetProduct } from "${specifier}";`)).toEqual(["R1"]);
    });

    it("acepta cualquier capa permitida del propio contexto", () => {
      const file = `${IDENTITY}/infrastructure/database/prisma-session.repository.ts`;
      const source = `
        import { map } from "./session.mapper.ts";
        import { Session } from "../../domain/aggregates/session.ts";`;

      expect(rulesOf(file, source)).toEqual([]);
    });

    it("distingue un contexto de una capacidad de platform con el mismo nombre", () => {
      const file = "src/platform/identity/presentation/routes/status.routes.ts";
      const specifier = "../../../../contexts/identity/domain/aggregates/session.ts";

      expect(rulesOf(file, `import type { Session } from "${specifier}";`)).toEqual(["R11"]);
    });
  });

  describe("R11: platform nunca importa de los contextos", () => {
    it.each([
      ["la aplicación de un contexto", "../../../../contexts/identity/application/queries/x.ts"],
      ["el dominio de un contexto", "../../../../contexts/identity/domain/aggregates/user.ts"],
    ])("rechaza %s", (_name, specifier) => {
      const file = `${HEALTH}/application/use-cases/check-readiness.use-case.ts`;

      expect(rulesOf(file, `import x from "${specifier}";`)).toEqual(["R11"]);
    });

    it("acepta shared y sus propias capas", () => {
      const file = `${HEALTH}/presentation/controllers/health.controller.ts`;
      const source = `
        import { problem } from "../../../../shared/http/problem.ts";
        import type { CheckReadiness } from "../../application/use-cases/check-readiness.use-case.ts";`;

      expect(rulesOf(file, source)).toEqual([]);
    });

    it("un contexto sí puede usar la aplicación de una capacidad de platform", () => {
      const file = `${IDENTITY}/infrastructure/database/prisma-session.repository.ts`;
      const specifier = "../../../../platform/health/application/ports/readiness-probe.ts";

      expect(rulesOf(file, `import type { ReadinessProbe } from "${specifier}";`)).toEqual([]);
    });
  });

  describe("R12: objetos de valor y eventos son las hojas del dominio", () => {
    it.each([
      ["un objeto de valor", "value-objects/email.ts", "un agregado", "../aggregates/user.ts"],
      ["un objeto de valor", "value-objects/email.ts", "un repositorio", "../repositories/x.ts"],
      ["un objeto de valor", "value-objects/email.ts", "un servicio", "../services/policy.ts"],
      ["un evento", "events/user-events.ts", "un agregado", "../aggregates/user.ts"],
      ["un evento", "events/user-events.ts", "una entidad", "../entities/refresh-token.ts"],
    ])("rechaza que %s (%s) importe %s", (_source, path, _target, specifier) => {
      expect(rulesOf(`${IDENTITY}/domain/${path}`, `import x from "${specifier}";`)).toEqual([
        "R12",
      ]);
    });

    it("acepta que se importen entre sí, shared y node:*", () => {
      const source = `
        import { createHash } from "node:crypto";
        import type { DomainEvent } from "../../../../shared/domain/domain-event.ts";
        import type { Email } from "../value-objects/email.ts";
        import type { UserRegistered } from "../events/user-events.ts";
        import { normalize } from "./normalize.ts";`;

      expect(rulesOf(`${IDENTITY}/domain/events/user-events.ts`, source)).toEqual([]);
      expect(rulesOf(`${IDENTITY}/domain/value-objects/email.ts`, source)).toEqual([]);
    });

    it("el resto del dominio sí importa objetos de valor y eventos", () => {
      const source = `
        import { Email } from "../value-objects/email.ts";
        import type { UserRegistered } from "../events/user-events.ts";`;

      expect(rulesOf(`${IDENTITY}/domain/aggregates/user.ts`, source)).toEqual([]);
      expect(rulesOf(`${IDENTITY}/domain/services/policy.ts`, source)).toEqual([]);
    });
  });

  describe("formas de import", () => {
    const file = `${IDENTITY}/application/commands/login.command.ts`;
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
    const source = `import { a } from "../src/contexts/identity/infrastructure/security/argon2-hasher.ts";`;

    expect(checkImports({ "tests/helpers/fakes.ts": source })).toEqual([]);
  });
});
