import {
  acceptanceTestBody,
  domainTestBody,
  entityFile,
  fakeRepositoryFile,
  integrationTestFile,
  lines,
  messageLines,
  permissionsFile,
  prismaModel,
  prismaRepositoryFile,
  type Rendered,
  repositoryInterfaceFile,
  routesFile,
  schemaFile,
  viewFile,
} from "./common.ts";
import {
  errorCode,
  type ModuleSpec,
  namesOf,
  rejectableField,
  sampleObject,
  TYPES,
} from "./spec.ts";

/** Funcionalidad nueva en Clean Architecture: una pieza en cada capa, con los nombres del libro. */
export function renderClean(spec: ModuleSpec): Rendered {
  const names = namesOf(spec);
  const {
    module: m,
    entity,
    EntityPascal: E,
    ModulePascal: M,
    entityCamel: e,
    moduleCamel: mc,
  } = names;
  const files = new Map<string, string>();
  const rejectable = rejectableField(spec);
  const useCases = `src/use-cases/${m}`;
  const sample = sampleObject(spec);

  files.set(`src/entities/${entity}.ts`, entityFile(spec, names, "./errors/app-error.ts"));
  files.set(
    `${useCases}/ports/${entity}.repository.ts`,
    repositoryInterfaceFile(names, `../../../entities/${entity}.ts`),
  );
  files.set(
    `${useCases}/${entity}-view.ts`,
    viewFile(spec, names, {
      typeName: `${E}View`,
      functionName: `to${E}View`,
      entityImport: `../../entities/${entity}.ts`,
    }),
  );
  files.set(
    `${useCases}/create-${entity}.use-case.ts`,
    lines([
      `import { ${E}, type New${E}Input } from "../../entities/${entity}.ts";`,
      `import type { UseCase } from "../use-case.ts";`,
      `import type { ${E}Repository } from "./ports/${entity}.repository.ts";`,
      `import { type ${E}View, to${E}View } from "./${entity}-view.ts";`,
      ``,
      `/** Modelo de petición: lo que el caso de uso necesita, sin rastro de HTTP. */`,
      `export type Create${E}Input = New${E}Input;`,
      ``,
      `export class Create${E} implements UseCase<Create${E}Input, ${E}View> {`,
      `  private readonly ${mc}: ${E}Repository;`,
      ``,
      `  constructor(deps: { ${mc}: ${E}Repository }) {`,
      `    this.${mc} = deps.${mc};`,
      `  }`,
      ``,
      `  async execute(input: Create${E}Input): Promise<${E}View> {`,
      `    const ${e} = ${E}.create(input);`,
      `    await this.${mc}.add(${e});`,
      `    return to${E}View(${e});`,
      `  }`,
      `}`,
      ``,
    ]),
  );
  files.set(
    `${useCases}/list-${m}.use-case.ts`,
    lines([
      `import type { UseCase } from "../use-case.ts";`,
      `import type { ${E}Repository } from "./ports/${entity}.repository.ts";`,
      `import { type ${E}View, to${E}View } from "./${entity}-view.ts";`,
      ``,
      `export class List${M} implements UseCase<void, ${E}View[]> {`,
      `  private readonly ${mc}: ${E}Repository;`,
      ``,
      `  constructor(deps: { ${mc}: ${E}Repository }) {`,
      `    this.${mc} = deps.${mc};`,
      `  }`,
      ``,
      `  async execute(): Promise<${E}View[]> {`,
      `    return (await this.${mc}.list()).map(to${E}View);`,
      `  }`,
      `}`,
      ``,
    ]),
  );
  files.set(`${useCases}/permissions.ts`, permissionsFile(names, "../permissions/permission.ts"));
  files.set(`src/interface-adapters/schemas/${entity}.schemas.ts`, schemaFile(spec, names));
  files.set(
    `src/interface-adapters/controllers/${m}.controller.ts`,
    lines([
      `import type { Create${E}Input } from "../../use-cases/${m}/create-${entity}.use-case.ts";`,
      `import type { ${E}View } from "../../use-cases/${m}/${entity}-view.ts";`,
      `import type { UseCase } from "../../use-cases/use-case.ts";`,
      `import { type Controller, created, ok } from "../http/http.ts";`,
      `import { parseBody } from "../http/parse-body.ts";`,
      `import { create${E}Schema } from "../schemas/${entity}.schemas.ts";`,
      ``,
      `export interface ${M}ControllerDeps {`,
      `  create${E}: UseCase<Create${E}Input, ${E}View>;`,
      `  list${M}: UseCase<void, ${E}View[]>;`,
      `}`,
      ``,
      `export function create${M}Controller(deps: ${M}ControllerDeps) {`,
      `  const create: Controller = async (request) => {`,
      `    const ${e} = await deps.create${E}.execute(parseBody(create${E}Schema, request.body));`,
      `    return created({ ${e} });`,
      `  };`,
      ``,
      `  const list: Controller = async () => ok({ ${names.pathCamel}: await deps.list${M}.execute() });`,
      ``,
      `  return { create, list };`,
      `}`,
      ``,
    ]),
  );
  files.set(
    `src/frameworks/database/prisma-${entity}.repository.ts`,
    prismaRepositoryFile(spec, names, {
      client: "../../generated/prisma/client.ts",
      entity: `../../entities/${entity}.ts`,
      repository: `../../use-cases/${m}/ports/${entity}.repository.ts`,
    }),
  );
  files.set(
    `src/frameworks/express/routes/${m}.routes.ts`,
    routesFile(names, {
      permissions: `../../../use-cases/${m}/permissions.ts`,
      controller: `../../../interface-adapters/controllers/${m}.controller.ts`,
      adapt: "../adapt.ts",
    }),
  );

  // Pruebas
  files.set(
    `tests/integration/frameworks/database/prisma-${entity}.repository.test.ts`,
    integrationTestFile(spec, names, {
      postgres: "../../../helpers/postgres.ts",
      entity: `../../../../src/entities/${entity}.ts`,
      repository: `../../../../src/frameworks/database/prisma-${entity}.repository.ts`,
      clock: "function",
    }),
  );
  files.set(
    `tests/helpers/${m}-fakes.ts`,
    fakeRepositoryFile(names, {
      entity: `../../src/entities/${entity}.ts`,
      repository: `../../src/use-cases/${m}/ports/${entity}.repository.ts`,
    }),
  );
  files.set(
    `tests/unit/entities/${entity}.test.ts`,
    lines([
      `import { describe, expect, it } from "vitest";`,
      `import { ${E} } from "../../../src/entities/${entity}.ts";`,
      ``,
      ...domainTestBody(spec, names),
      `});`,
      ``,
    ]),
  );
  files.set(
    `tests/unit/use-cases/${m}/create-${entity}.test.ts`,
    lines([
      `import { describe, expect, it } from "vitest";`,
      `import { Create${E} } from "../../../../src/use-cases/${m}/create-${entity}.use-case.ts";`,
      `import { List${M} } from "../../../../src/use-cases/${m}/list-${m}.use-case.ts";`,
      `import { InMemory${E}Repository } from "../../../helpers/${m}-fakes.ts";`,
      ``,
      `describe("Create${E}", () => {`,
      `  it("lo guarda y devuelve su vista pública", async () => {`,
      `    const ${mc} = new InMemory${E}Repository();`,
      ``,
      `    const result = await new Create${E}({ ${mc} }).execute(${sample});`,
      ``,
      `    expect(result).toMatchObject(${sample});`,
      `    expect(${mc}.items).toHaveLength(1);`,
      `    expect(await new List${M}({ ${mc} }).execute()).toEqual([result]);`,
      `  });`,
      ...(rejectable
        ? [
            ``,
            `  it("si la entidad rechaza los datos no se guarda nada", async () => {`,
            `    const ${mc} = new InMemory${E}Repository();`,
            ``,
            `    await expect(`,
            `      new Create${E}({ ${mc} }).execute(${sampleObject(spec, { [rejectable.name]: TYPES[rejectable.type].invalidSample ?? "" })}),`,
            `    ).rejects.toMatchObject({ code: "${errorCode(names, rejectable)}" });`,
            `    expect(${mc}.items).toEqual([]);`,
            `  });`,
          ]
        : []),
      `});`,
      ``,
    ]),
  );
  files.set(
    `tests/unit/interface-adapters/controllers/${m}.controller.test.ts`,
    lines([
      `import { describe, expect, it } from "vitest";`,
      `import { create${M}Controller } from "../../../../src/interface-adapters/controllers/${m}.controller.ts";`,
      `import type { Create${E}Input } from "../../../../src/use-cases/${m}/create-${entity}.use-case.ts";`,
      `import type { ${E}View } from "../../../../src/use-cases/${m}/${entity}-view.ts";`,
      `import { httpRequest } from "../../../helpers/http-request.ts";`,
      `import { StubUseCase } from "../../../helpers/use-case-fakes.ts";`,
      ``,
      `const VIEW = { publicId: "p-1", ...${sample}, createdAt: "2026-11-15T10:00:00.000Z" } as ${E}View;`,
      ``,
      `describe("controlador de ${m}", () => {`,
      `  it("create valida el cuerpo, llama al caso de uso y responde 201", async () => {`,
      `    const create${E} = StubUseCase.returning<Create${E}Input, ${E}View>(VIEW);`,
      `    const controller = create${M}Controller({`,
      `      create${E},`,
      `      list${M}: StubUseCase.returning([VIEW]),`,
      `    });`,
      ``,
      `    const response = await controller.create(httpRequest({ body: ${sample} }));`,
      ``,
      `    expect(create${E}.calls).toEqual([${sample}]);`,
      `    expect(response).toEqual({ status: 201, body: { ${e}: VIEW } });`,
      `  });`,
      ``,
      `  it("create rechaza campos desconocidos sin llamar al caso de uso", async () => {`,
      `    const create${E} = StubUseCase.returning<Create${E}Input, ${E}View>(VIEW);`,
      `    const controller = create${M}Controller({`,
      `      create${E},`,
      `      list${M}: StubUseCase.returning([VIEW]),`,
      `    });`,
      ``,
      `    await expect(`,
      `      controller.create(httpRequest({ body: { ...${sample}, unknownField: 1 } })),`,
      `    ).rejects.toMatchObject({ kind: "validation" });`,
      `    expect(create${E}.calls).toEqual([]);`,
      `  });`,
      ``,
      `  it("list responde 200 con la lista", async () => {`,
      `    const controller = create${M}Controller({`,
      `      create${E}: StubUseCase.returning(VIEW),`,
      `      list${M}: StubUseCase.returning([VIEW]),`,
      `    });`,
      ``,
      `    expect(await controller.list(httpRequest())).toEqual({`,
      `      status: 200,`,
      `      body: { ${names.pathCamel}: [VIEW] },`,
      `    });`,
      `  });`,
      `});`,
      ``,
    ]),
  );
  files.set(
    `tests/acceptance/${m}.test.ts`,
    lines([
      `import request from "supertest";`,
      `import { describe, expect, it } from "vitest";`,
      `import { Role } from "../../src/entities/role.ts";`,
      `import { User } from "../../src/entities/user.ts";`,
      `import { createApp } from "../../src/frameworks/express/app.ts";`,
      `import { create${M}Router } from "../../src/frameworks/express/routes/${m}.routes.ts";`,
      `import { GetUserAccess } from "../../src/use-cases/auth/get-user-access.use-case.ts";`,
      `import { Create${E} } from "../../src/use-cases/${m}/create-${entity}.use-case.ts";`,
      `import { List${M} } from "../../src/use-cases/${m}/list-${m}.use-case.ts";`,
      `import { ${names.MODULE_UPPER}_PERMISSIONS } from "../../src/use-cases/${m}/permissions.ts";`,
      `import { PermissionRegistry } from "../../src/use-cases/permissions/permission.ts";`,
      `import { InMemoryUserRepository } from "../helpers/fakes.ts";`,
      `import { testAuthenticate, testAuthorize } from "../helpers/http-fakes.ts";`,
      `import { InMemory${E}Repository } from "../helpers/${m}-fakes.ts";`,
      `import { InMemoryRoleRepository, testRegistry } from "../helpers/role-fakes.ts";`,
      ``,
      `async function build() {`,
      `  const users = new InMemoryUserRepository();`,
      `  const roles = new InMemoryRoleRepository(users);`,
      `  const registry = new PermissionRegistry([`,
      `    ...testRegistry()`,
      `      .groups()`,
      `      .flatMap((group) => group.permissions),`,
      `    ...${names.MODULE_UPPER}_PERMISSIONS,`,
      `  ]);`,
      `  const getUserAccess = new GetUserAccess({ roles, registry });`,
      `  const ${mc} = new InMemory${E}Repository();`,
      `  const router = create${M}Router({`,
      `    authenticate: testAuthenticate(users),`,
      `    authorize: testAuthorize(registry, getUserAccess),`,
      `    create${E}: new Create${E}({ ${mc} }),`,
      `    list${M}: new List${M}({ ${mc} }),`,
      `  });`,
      ``,
      `  /** Crea un usuario con un rol hecho a medida y devuelve su cabecera de autenticación. */`,
      `  const userWith = async (email: string, permissions: string[]) => {`,
      `    const user = User.create({ email, passwordHash: "x", firstName: "Ana", lastName: "Gómez" });`,
      `    await users.add(user);`,
      `    const role = Role.create({ name: \`Rol de \${email.split("@")[0]}\`, permissions });`,
      `    await roles.add(role);`,
      `    await roles.setUserRoles(user.publicId, [role.publicId]);`,
      `    return \`Bearer access:\${user.publicId}\`;`,
      `  };`,
      ``,
      `  return { app: createApp({ routers: [router] }), userWith };`,
      `}`,
      ``,
      ...acceptanceTestBody(spec, names),
    ]),
  );

  return {
    files,
    edits: [
      {
        path: "src/composition.ts",
        marker: "imports",
        lines: [
          `import { Prisma${E}Repository } from "./frameworks/database/prisma-${entity}.repository.ts";`,
          `import { create${M}Router } from "./frameworks/express/routes/${m}.routes.ts";`,
          `import { Create${E} } from "./use-cases/${m}/create-${entity}.use-case.ts";`,
          `import { List${M} } from "./use-cases/${m}/list-${m}.use-case.ts";`,
          `import { ${names.MODULE_UPPER}_PERMISSIONS } from "./use-cases/${m}/permissions.ts";`,
        ],
      },
      {
        path: "src/composition.ts",
        marker: "permissions",
        lines: [`    ...${names.MODULE_UPPER}_PERMISSIONS,`],
      },
      {
        path: "src/composition.ts",
        marker: "wiring",
        lines: [
          `  const ${mc}Repository = new Prisma${E}Repository(prisma);`,
          `  const ${mc}Router = create${M}Router({`,
          `    authenticate,`,
          `    authorize,`,
          `    create${E}: new Create${E}({ ${mc}: ${mc}Repository }),`,
          `    list${M}: new List${M}({ ${mc}: ${mc}Repository }),`,
          `  });`,
          ``,
        ],
      },
      { path: "src/composition.ts", marker: "routers", lines: [`      ${mc}Router,`] },
      { path: "prisma/schema.prisma", marker: "models", lines: prismaModel(spec, names) },
      {
        path: "src/interface-adapters/presenters/messages.ts",
        marker: "messages-en",
        lines: messageLines(spec, names, "en"),
      },
      {
        path: "src/interface-adapters/presenters/messages.ts",
        marker: "messages-es",
        lines: messageLines(spec, names, "es"),
      },
    ],
  };
}
