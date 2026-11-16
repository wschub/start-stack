import {
  acceptanceTestBody,
  domainTestBody,
  entityFile,
  expressControllerFile,
  fakeRepositoryFile,
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

/** Módulo nuevo en la arquitectura hexagonal: `src/modules/<módulo>/` con sus cuatro capas. */
export function renderHexagonal(spec: ModuleSpec): Rendered {
  const names = namesOf(spec);
  const { module: m, entity, EntityPascal: E, ModulePascal: M, entityCamel: e } = names;
  const base = `src/modules/${m}`;
  const files = new Map<string, string>();
  const rejectable = rejectableField(spec);

  files.set(
    `${base}/domain/entities/${entity}.entity.ts`,
    entityFile(spec, names, "../../../../shared/errors/app-error.ts"),
  );
  files.set(
    `${base}/domain/repositories/${entity}.repository.ts`,
    repositoryInterfaceFile(names, `../entities/${entity}.entity.ts`),
  );
  files.set(
    `${base}/application/public-${entity}.ts`,
    viewFile(spec, names, {
      typeName: `Public${E}`,
      functionName: `toPublic${E}`,
      entityImport: `../domain/entities/${entity}.entity.ts`,
    }),
  );
  files.set(
    `${base}/application/use-cases/create-${entity}.use-case.ts`,
    lines([
      `import { ${E}, type New${E}Input } from "../../domain/entities/${entity}.entity.ts";`,
      `import type { ${E}Repository } from "../../domain/repositories/${entity}.repository.ts";`,
      `import { type Public${E}, toPublic${E} } from "../public-${entity}.ts";`,
      ``,
      `export type Create${E}Input = New${E}Input;`,
      ``,
      `export class Create${E} {`,
      `  private readonly ${names.moduleCamel}: ${E}Repository;`,
      ``,
      `  constructor(deps: { ${names.moduleCamel}: ${E}Repository }) {`,
      `    this.${names.moduleCamel} = deps.${names.moduleCamel};`,
      `  }`,
      ``,
      `  async execute(input: Create${E}Input): Promise<Public${E}> {`,
      `    const ${e} = ${E}.create(input);`,
      `    await this.${names.moduleCamel}.add(${e});`,
      `    return toPublic${E}(${e});`,
      `  }`,
      `}`,
      ``,
    ]),
  );
  files.set(
    `${base}/application/use-cases/list-${m}.use-case.ts`,
    lines([
      `import type { ${E}Repository } from "../../domain/repositories/${entity}.repository.ts";`,
      `import { type Public${E}, toPublic${E} } from "../public-${entity}.ts";`,
      ``,
      `export class List${M} {`,
      `  private readonly ${names.moduleCamel}: ${E}Repository;`,
      ``,
      `  constructor(deps: { ${names.moduleCamel}: ${E}Repository }) {`,
      `    this.${names.moduleCamel} = deps.${names.moduleCamel};`,
      `  }`,
      ``,
      `  async execute(): Promise<Public${E}[]> {`,
      `    return (await this.${names.moduleCamel}.list()).map(toPublic${E});`,
      `  }`,
      `}`,
      ``,
    ]),
  );
  files.set(
    `${base}/application/permissions.ts`,
    permissionsFile(names, "../../../shared/permissions/permission.ts"),
  );
  files.set(`${base}/presentation/schemas/${entity}.schemas.ts`, schemaFile(spec, names));
  files.set(
    `${base}/presentation/controllers/${m}.controller.ts`,
    expressControllerFile(names, {
      parseBody: "../../../../shared/http/validate.ts",
      create: `../../application/use-cases/create-${entity}.use-case.ts`,
      list: `../../application/use-cases/list-${m}.use-case.ts`,
      schema: `../schemas/${entity}.schemas.ts`,
    }),
  );
  files.set(
    `${base}/presentation/routes/${m}.routes.ts`,
    routesFile(names, {
      permissions: "../../application/permissions.ts",
      controller: `../controllers/${m}.controller.ts`,
    }),
  );
  files.set(
    `${base}/infrastructure/database/prisma-${entity}.repository.ts`,
    prismaRepositoryFile(spec, names, {
      client: "../../../../generated/prisma/client.ts",
      entity: `../../domain/entities/${entity}.entity.ts`,
      repository: `../../domain/repositories/${entity}.repository.ts`,
    }),
  );

  // Pruebas
  files.set(
    `tests/helpers/${m}-fakes.ts`,
    fakeRepositoryFile(names, {
      entity: `../../src/modules/${m}/domain/entities/${entity}.entity.ts`,
      repository: `../../src/modules/${m}/domain/repositories/${entity}.repository.ts`,
    }),
  );
  files.set(
    `tests/unit/modules/${m}/${entity}.entity.test.ts`,
    lines([
      `import { describe, expect, it } from "vitest";`,
      `import { ${E} } from "../../../../src/modules/${m}/domain/entities/${entity}.entity.ts";`,
      ``,
      ...domainTestBody(spec, names),
      `});`,
      ``,
    ]),
  );
  files.set(
    `tests/unit/modules/${m}/create-${entity}.test.ts`,
    lines([
      `import { describe, expect, it } from "vitest";`,
      `import { Create${E} } from "../../../../src/modules/${m}/application/use-cases/create-${entity}.use-case.ts";`,
      `import { List${M} } from "../../../../src/modules/${m}/application/use-cases/list-${m}.use-case.ts";`,
      `import { InMemory${E}Repository } from "../../../helpers/${m}-fakes.ts";`,
      ``,
      `describe("Create${E}", () => {`,
      `  it("lo guarda y devuelve su vista pública", async () => {`,
      `    const ${names.moduleCamel} = new InMemory${E}Repository();`,
      ``,
      `    const result = await new Create${E}({ ${names.moduleCamel} }).execute(${sampleObject(spec)});`,
      ``,
      `    expect(result).toMatchObject(${sampleObject(spec)});`,
      `    expect(${names.moduleCamel}.items).toHaveLength(1);`,
      `    expect(await new List${M}({ ${names.moduleCamel} }).execute()).toEqual([result]);`,
      `  });`,
      ...(rejectable
        ? [
            ``,
            `  it("si la entidad rechaza los datos no se guarda nada", async () => {`,
            `    const ${names.moduleCamel} = new InMemory${E}Repository();`,
            ``,
            `    await expect(`,
            `      new Create${E}({ ${names.moduleCamel} }).execute(${sampleObject(spec, { [rejectable.name]: TYPES[rejectable.type].invalidSample ?? "" })}),`,
            `    ).rejects.toMatchObject({ code: "${errorCode(names, rejectable)}" });`,
            `    expect(${names.moduleCamel}.items).toEqual([]);`,
            `  });`,
          ]
        : []),
      `});`,
      ``,
    ]),
  );
  files.set(
    `tests/acceptance/${m}.test.ts`,
    lines([
      `import request from "supertest";`,
      `import { describe, expect, it } from "vitest";`,
      `import { createApp } from "../../src/app.ts";`,
      `import { GetUserAccess } from "../../src/modules/auth/application/use-cases/get-user-access.use-case.ts";`,
      `import { Role } from "../../src/modules/auth/domain/entities/role.ts";`,
      `import { requireAuth } from "../../src/modules/auth/presentation/middlewares/require-auth.ts";`,
      `import { createPermissionGuard } from "../../src/modules/auth/presentation/middlewares/require-permission.ts";`,
      `import { ${names.MODULE_UPPER}_PERMISSIONS } from "../../src/modules/${m}/application/permissions.ts";`,
      `import { Create${E} } from "../../src/modules/${m}/application/use-cases/create-${entity}.use-case.ts";`,
      `import { List${M} } from "../../src/modules/${m}/application/use-cases/list-${m}.use-case.ts";`,
      `import { create${M}Router } from "../../src/modules/${m}/presentation/routes/${m}.routes.ts";`,
      `import { User } from "../../src/modules/users/domain/entities/user.entity.ts";`,
      `import { PermissionRegistry } from "../../src/shared/permissions/permission.ts";`,
      `import { InMemoryUserRepository } from "../helpers/fakes.ts";`,
      `import { InMemory${E}Repository } from "../helpers/${m}-fakes.ts";`,
      `import { InMemoryRoleRepository, testRegistry } from "../helpers/role-fakes.ts";`,
      `import { FakeAccessTokenService } from "../helpers/session-fakes.ts";`,
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
      `  const ${names.moduleCamel} = new InMemory${E}Repository();`,
      `  const router = create${M}Router({`,
      `    authenticate: requireAuth({ accessTokens: new FakeAccessTokenService(), users }),`,
      `    authorize: createPermissionGuard({ registry, getUserAccess }),`,
      `    create${E}: new Create${E}({ ${names.moduleCamel} }),`,
      `    list${M}: new List${M}({ ${names.moduleCamel} }),`,
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
          `import { ${names.MODULE_UPPER}_PERMISSIONS } from "./modules/${m}/application/permissions.ts";`,
          `import { Create${E} } from "./modules/${m}/application/use-cases/create-${entity}.use-case.ts";`,
          `import { List${M} } from "./modules/${m}/application/use-cases/list-${m}.use-case.ts";`,
          `import { Prisma${E}Repository } from "./modules/${m}/infrastructure/database/prisma-${entity}.repository.ts";`,
          `import { create${M}Router } from "./modules/${m}/presentation/routes/${m}.routes.ts";`,
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
          `  const ${names.moduleCamel}Repository = new Prisma${E}Repository(prisma);`,
          `  const ${names.moduleCamel}Router = create${M}Router({`,
          `    authenticate,`,
          `    authorize,`,
          `    create${E}: new Create${E}({ ${names.moduleCamel}: ${names.moduleCamel}Repository }),`,
          `    list${M}: new List${M}({ ${names.moduleCamel}: ${names.moduleCamel}Repository }),`,
          `  });`,
          ``,
        ],
      },
      {
        path: "src/composition.ts",
        marker: "routers",
        lines: [`      ${names.moduleCamel}Router,`],
      },
      { path: "prisma/schema.prisma", marker: "models", lines: prismaModel(spec, names) },
      {
        path: "src/shared/i18n/messages.ts",
        marker: "messages-en",
        lines: messageLines(spec, names, "en"),
      },
      {
        path: "src/shared/i18n/messages.ts",
        marker: "messages-es",
        lines: messageLines(spec, names, "es"),
      },
    ],
  };
}
