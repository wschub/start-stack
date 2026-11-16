import {
  errorCode,
  type Field,
  type ModuleSpec,
  type Names,
  rejectableField,
  sampleObject,
  TYPES,
} from "./spec.ts";

/** Archivos nuevos (ruta → contenido) y bloques que se insertan en archivos existentes. */
export interface Rendered {
  files: Map<string, string>;
  edits: Edit[];
}

export interface Edit {
  path: string;
  /** Nombre del marcador: `imports` es `// start-stack:imports`. */
  marker: string;
  /** Líneas que se insertan justo encima del marcador, ya con su sangría. */
  lines: string[];
}

export const lines = (items: string[]): string => items.join("\n");

/** Sentencias que validan un campo en una entidad (hexagonal y Clean) y dejan su valor en una variable. */
export function entityValidation(names: Names, field: Field): string[] {
  const code = errorCode(names, field);
  const fail = `throw invalid("${code}", "${field.name}");`;
  switch (field.type) {
    case "string":
      return [
        `    const ${field.name} = input.${field.name}.trim();`,
        `    if (${field.name}.length === 0 || ${field.name}.length > MAX_TEXT) ${fail}`,
      ];
    case "int":
      return [`    if (!Number.isSafeInteger(input.${field.name})) ${fail}`];
    case "boolean":
      return [`    if (typeof input.${field.name} !== "boolean") ${fail}`];
    case "datetime":
      return [
        `    const ${field.name} = new Date(input.${field.name});`,
        `    if (Number.isNaN(${field.name}.getTime())) ${fail}`,
      ];
  }
}

/** Cómo se pasa el campo ya validado al constructor. */
export function validatedValue(field: Field): string {
  return field.type === "string" || field.type === "datetime"
    ? field.name
    : `${field.name}: input.${field.name}`;
}

/** Entidad de las arquitecturas hexagonal y Clean. `errorImport` es la ruta a AppError. */
export function entityFile(spec: ModuleSpec, names: Names, errorImport: string): string {
  const E = names.EntityPascal;
  const hasText = spec.fields.some((field) => field.type === "string");
  return lines([
    `import { randomUUID } from "node:crypto";`,
    `import { AppError } from "${errorImport}";`,
    ``,
    `export interface ${E}Props {`,
    `  publicId: string;`,
    ...spec.fields.map((field) => `  ${field.name}: ${TYPES[field.type].domain};`),
    `  createdAt: Date;`,
    `}`,
    ``,
    `export interface New${E}Input {`,
    ...spec.fields.map((field) => `  ${field.name}: ${TYPES[field.type].wire};`),
    `}`,
    ``,
    ...(hasText ? [`const MAX_TEXT = 200;`, ``] : []),
    `function invalid(code: string, field: string): AppError {`,
    `  return new AppError("validation", { code, details: { field } });`,
    `}`,
    ``,
    `export class ${E} {`,
    `  readonly publicId: string;`,
    ...spec.fields.map((field) => `  readonly ${field.name}: ${TYPES[field.type].domain};`),
    `  readonly createdAt: Date;`,
    ``,
    `  private constructor(props: ${E}Props) {`,
    `    this.publicId = props.publicId;`,
    ...spec.fields.map((field) => `    this.${field.name} = props.${field.name};`),
    `    this.createdAt = props.createdAt;`,
    `    Object.freeze(this);`,
    `  }`,
    ``,
    `  /** Único camino para crear uno nuevo: aquí viven sus reglas. */`,
    `  static create(input: New${E}Input, now: () => Date = () => new Date()): ${E} {`,
    ...spec.fields.flatMap((field) => entityValidation(names, field)),
    `    return new ${E}({`,
    `      publicId: randomUUID(),`,
    ...spec.fields.map((field) => `      ${validatedValue(field)},`),
    `      createdAt: now(),`,
    `    });`,
    `  }`,
    ``,
    `  /** Reconstruye uno ya guardado, sin validar de nuevo. Lo usa el repositorio. */`,
    `  static restore(props: ${E}Props): ${E} {`,
    `    return new ${E}(props);`,
    `  }`,
    `}`,
    ``,
  ]);
}

/** Vista pública: lo que sale de la aplicación. `typeName` es `PublicProduct` o `ProductView`. */
export function viewFile(
  spec: ModuleSpec,
  names: Names,
  options: { typeName: string; functionName: string; entityImport: string },
): string {
  const E = names.EntityPascal;
  return lines([
    `import type { ${E} } from "${options.entityImport}";`,
    ``,
    `/** Lo que sale de la aplicación: datos planos, nunca la entidad. */`,
    `export interface ${options.typeName} {`,
    `  publicId: string;`,
    ...spec.fields.map((field) => `  ${field.name}: ${TYPES[field.type].wire};`),
    `  createdAt: string;`,
    `}`,
    ``,
    `export function ${options.functionName}(${names.entityCamel}: ${E}): ${options.typeName} {`,
    `  return {`,
    `    publicId: ${names.entityCamel}.publicId,`,
    ...spec.fields.map(
      (field) =>
        `    ${field.name}: ${names.entityCamel}.${field.name}${field.type === "datetime" ? ".toISOString()" : ""},`,
    ),
    `    createdAt: ${names.entityCamel}.createdAt.toISOString(),`,
    `  };`,
    `}`,
    ``,
  ]);
}

export function repositoryInterfaceFile(names: Names, entityImport: string, note = ""): string {
  const E = names.EntityPascal;
  return lines([
    `import type { ${E} } from "${entityImport}";`,
    ``,
    `/** Lo que la aplicación necesita de la persistencia. No dice cómo ni dónde se guarda. */`,
    `export interface ${E}Repository {`,
    ...(note ? [`  /** ${note} */`] : []),
    `  add(${names.entityCamel}: ${E}): Promise<void>;`,
    `  list(): Promise<${E}[]>;`,
    `}`,
    ``,
  ]);
}

export function permissionsFile(names: Names, permissionImport: string): string {
  const M = names.MODULE_UPPER;
  return lines([
    `import { definePermissions } from "${permissionImport}";`,
    ``,
    `export const ${M}_PERMISSION = {`,
    `  read: "${names.module}:read",`,
    `  manage: "${names.module}:manage",`,
    `} as const;`,
    ``,
    `export const ${M}_PERMISSIONS = definePermissions("${names.module}", {`,
    `  [${M}_PERMISSION.read]: { es: "Ver ${names.module}", en: "View ${names.module}" },`,
    `  [${M}_PERMISSION.manage]: { es: "Crear ${names.module}", en: "Create ${names.module}" },`,
    `});`,
    ``,
  ]);
}

export function schemaFile(spec: ModuleSpec, names: Names): string {
  return lines([
    `import { z } from "zod";`,
    ``,
    `/** Solo la forma de la petición. Las reglas del negocio las comprueba el dominio. */`,
    `export const create${names.EntityPascal}Schema = z`,
    `  .object({`,
    ...spec.fields.map((field) => `    ${field.name}: ${TYPES[field.type].zod},`),
    `  })`,
    `  .strict();`,
    ``,
  ]);
}

/** Repositorio con Prisma. Con `events`, publica los eventos del agregado después de guardar (DDD). */
export function prismaRepositoryFile(
  spec: ModuleSpec,
  names: Names,
  imports: { client: string; entity: string; repository: string; eventBus?: string },
): string {
  const E = names.EntityPascal;
  const e = names.entityCamel;
  const withEvents = imports.eventBus !== undefined;
  return lines([
    `import type { PrismaClient } from "${imports.client}";`,
    ...(withEvents
      ? [`import { type EventBus, NULL_EVENT_BUS } from "${imports.eventBus ?? ""}";`]
      : []),
    `import { ${E} } from "${imports.entity}";`,
    `import type { ${E}Repository } from "${imports.repository}";`,
    ``,
    `export class Prisma${E}Repository implements ${E}Repository {`,
    `  private readonly prisma: PrismaClient;`,
    ...(withEvents ? [`  private readonly events: EventBus;`] : []),
    ``,
    withEvents
      ? `  constructor(prisma: PrismaClient, events: EventBus = NULL_EVENT_BUS) {`
      : `  constructor(prisma: PrismaClient) {`,
    `    this.prisma = prisma;`,
    ...(withEvents ? [`    this.events = events;`] : []),
    `  }`,
    ``,
    `  async add(${e}: ${E}): Promise<void> {`,
    `    await this.prisma.${e}.create({`,
    `      data: {`,
    `        publicId: ${e}.publicId,`,
    ...spec.fields.map((field) => `        ${field.name}: ${e}.${field.name},`),
    `        createdAt: ${e}.createdAt,`,
    `      },`,
    `    });`,
    ...(withEvents
      ? [
          `    // Los eventos se publican solo después de guardar: si la escritura falla, no sale ninguno.`,
          `    await this.events.publish(${e}.pullEvents());`,
        ]
      : []),
    `  }`,
    ``,
    `  async list(): Promise<${E}[]> {`,
    `    const rows = await this.prisma.${e}.findMany({ orderBy: { createdAt: "asc" } });`,
    `    return rows.map((row) =>`,
    `      ${E}.restore({`,
    `        publicId: row.publicId,`,
    ...spec.fields.map((field) => `        ${field.name}: row.${field.name},`),
    `        createdAt: row.createdAt,`,
    `      }),`,
    `    );`,
    `  }`,
    `}`,
    ``,
  ]);
}

export function prismaModel(spec: ModuleSpec, names: Names): string[] {
  return [
    `model ${names.EntityPascal} {`,
    `  id        Int      @id @default(autoincrement())`,
    `  publicId  String   @unique @db.Uuid`,
    ...spec.fields.map((field) => `  ${field.name} ${TYPES[field.type].prisma}`),
    `  createdAt DateTime @default(now())`,
    ``,
    `  @@map("${names.moduleSnake}")`,
    `}`,
    ``,
  ];
}

export function messageLines(spec: ModuleSpec, names: Names, locale: "en" | "es"): string[] {
  return spec.fields.map((field) => {
    const text =
      locale === "en"
        ? `The field "${field.name}" of the ${names.entity} is not valid.`
        : `El campo "${field.name}" de ${names.entity} no es válido.`;
    return `    ${errorCode(names, field)}: ${JSON.stringify(text)},`;
  });
}

/** Controlador de Express (hexagonal y DDD). */
export function expressControllerFile(
  names: Names,
  imports: { parseBody: string; create: string; list: string; schema: string },
): string {
  const E = names.EntityPascal;
  const M = names.ModulePascal;
  return lines([
    `import type { RequestHandler } from "express";`,
    `import { parseBody } from "${imports.parseBody}";`,
    `import type { Create${E} } from "${imports.create}";`,
    `import type { List${M} } from "${imports.list}";`,
    `import { create${E}Schema } from "${imports.schema}";`,
    ``,
    `export interface ${M}ControllerDeps {`,
    `  create${E}: Create${E};`,
    `  list${M}: List${M};`,
    `}`,
    ``,
    `export function create${M}Controller(deps: ${M}ControllerDeps) {`,
    `  const create: RequestHandler = async (req, res) => {`,
    `    const ${names.entityCamel} = await deps.create${E}.execute(parseBody(create${E}Schema, req.body));`,
    `    res.status(201).json({ ${names.entityCamel} });`,
    `  };`,
    ``,
    `  const list: RequestHandler = async (_req, res) => {`,
    `    res.json({ ${names.moduleCamel}: await deps.list${M}.execute() });`,
    `  };`,
    ``,
    `  return { create, list };`,
    `}`,
    ``,
  ]);
}

/** Rutas de Express. Con `adapt`, los controladores no conocen Express (Clean). */
export function routesFile(
  names: Names,
  imports: { permissions: string; controller: string; adapt?: string },
): string {
  const M = names.ModulePascal;
  const P = `${names.MODULE_UPPER}_PERMISSION`;
  const handler = (name: string) =>
    imports.adapt === undefined ? `controller.${name}` : `adapt(controller.${name})`;
  return lines([
    `import { type RequestHandler, Router } from "express";`,
    `import { ${P} } from "${imports.permissions}";`,
    `import {`,
    `  create${M}Controller,`,
    `  type ${M}ControllerDeps,`,
    `} from "${imports.controller}";`,
    ...(imports.adapt === undefined ? [] : [`import { adapt } from "${imports.adapt}";`]),
    ``,
    `export interface ${M}RouterDeps extends ${M}ControllerDeps {`,
    `  /** Middlewares de autenticación y permisos, ya construidos en composition.ts. */`,
    `  authenticate: RequestHandler;`,
    `  authorize: (permission: string) => RequestHandler;`,
    `}`,
    ``,
    `export function create${M}Router(deps: ${M}RouterDeps): Router {`,
    `  const router = Router();`,
    `  const controller = create${M}Controller(deps);`,
    `  const read = [deps.authenticate, deps.authorize(${P}.read)];`,
    `  const manage = [deps.authenticate, deps.authorize(${P}.manage)];`,
    ``,
    `  router.get("/${names.module}", read, ${handler("list")});`,
    `  router.post("/${names.module}", manage, ${handler("create")});`,
    ``,
    `  return router;`,
    `}`,
    ``,
  ]);
}

/** Repositorio en memoria para las pruebas. Con `eventBus`, publica eventos como el real (DDD). */
export function fakeRepositoryFile(
  names: Names,
  imports: { entity: string; repository: string; eventBus?: string },
): string {
  const E = names.EntityPascal;
  const withEvents = imports.eventBus !== undefined;
  return lines([
    `import type { ${E} } from "${imports.entity}";`,
    `import type { ${E}Repository } from "${imports.repository}";`,
    ...(withEvents
      ? [`import { type EventBus, NULL_EVENT_BUS } from "${imports.eventBus ?? ""}";`]
      : []),
    ``,
    `/** Doble del repositorio: la aplicación no nota la diferencia con el real. */`,
    `export class InMemory${E}Repository implements ${E}Repository {`,
    `  readonly items: ${E}[] = [];`,
    ...(withEvents
      ? [
          `  private readonly events: EventBus;`,
          ``,
          `  constructor(events: EventBus = NULL_EVENT_BUS) {`,
          `    this.events = events;`,
          `  }`,
        ]
      : []),
    ``,
    `  async add(${names.entityCamel}: ${E}): Promise<void> {`,
    `    this.items.push(${names.entityCamel});`,
    ...(withEvents ? [`    await this.events.publish(${names.entityCamel}.pullEvents());`] : []),
    `  }`,
    ``,
    `  async list(): Promise<${E}[]> {`,
    `    return [...this.items];`,
    `  }`,
    `}`,
    ``,
  ]);
}

/** Cuerpo común de la prueba de aceptación; cada arquitectura aporta sus imports y su `build()`. */
export function acceptanceTestBody(spec: ModuleSpec, names: Names): string[] {
  const path = `/${names.module}`;
  const body = sampleObject(spec);
  const rejectable = rejectableField(spec);
  return [
    `describe("${path}", () => {`,
    `  it("responde 401 sin token y 403 sin el permiso", async () => {`,
    `    const { app, userWith } = await build();`,
    `    const reader = await userWith("lector@example.com", ["${names.module}:read"]);`,
    ``,
    `    const anonymous = await request(app).post("${path}").send(${body});`,
    `    const forbidden = await request(app).post("${path}").set("Authorization", reader).send(${body});`,
    ``,
    `    expect(anonymous.status).toBe(401);`,
    `    expect([forbidden.status, forbidden.body.code]).toEqual([403, "PERMISSION_DENIED"]);`,
    `  });`,
    ``,
    `  it("crea uno y luego lo lista", async () => {`,
    `    const { app, userWith } = await build();`,
    `    const admin = await userWith("admin@example.com", ["${names.module}:manage", "${names.module}:read"]);`,
    ``,
    `    const created = await request(app).post("${path}").set("Authorization", admin).send(${body});`,
    `    const list = await request(app).get("${path}").set("Authorization", admin);`,
    ``,
    `    expect(created.status).toBe(201);`,
    `    expect(created.body.${names.entityCamel}).toMatchObject(${body});`,
    `    expect(created.body.${names.entityCamel}).not.toHaveProperty("id");`,
    `    expect(list.body.${names.moduleCamel}).toHaveLength(1);`,
    `  });`,
    ``,
    `  it("rechaza campos desconocidos con 400", async () => {`,
    `    const { app, userWith } = await build();`,
    `    const admin = await userWith("admin@example.com", ["${names.module}:manage"]);`,
    ``,
    `    const res = await request(app)`,
    `      .post("${path}")`,
    `      .set("Authorization", admin)`,
    `      .send({ ...${body}, unknownField: 1 });`,
    ``,
    `    expect([res.status, res.body.code]).toEqual([400, "VALIDATION_ERROR"]);`,
    `  });`,
    ...(rejectable
      ? [
          ``,
          `  it("rechaza un valor inválido con el código del dominio", async () => {`,
          `    const { app, userWith } = await build();`,
          `    const admin = await userWith("admin@example.com", ["${names.module}:manage"]);`,
          ``,
          `    const res = await request(app)`,
          `      .post("${path}")`,
          `      .set("Authorization", admin)`,
          `      .send(${sampleObject(spec, { [rejectable.name]: TYPES[rejectable.type].invalidSample ?? "" })});`,
          ``,
          `    expect([res.status, res.body.code]).toEqual([400, "${errorCode(names, rejectable)}"]);`,
          `  });`,
        ]
      : []),
    `});`,
    ``,
  ];
}

/** Pruebas de la entidad o agregado: creación válida y rechazo del primer campo rechazable. */
export function domainTestBody(spec: ModuleSpec, names: Names): string[] {
  const E = names.EntityPascal;
  const rejectable = rejectableField(spec);
  return [
    `describe("${E}", () => {`,
    `  it("se crea con datos válidos y un id propio", () => {`,
    `    const ${names.entityCamel} = ${E}.create(${sampleObject(spec)});`,
    ``,
    `    expect(${names.entityCamel}.publicId).toMatch(/^[0-9a-f-]{36}$/);`,
    ...spec.fields
      .filter((field) => field.type !== "datetime")
      .map(
        (field) =>
          `    expect(${names.entityCamel}.${field.name}).toBe(${TYPES[field.type].sample});`,
      ),
    `  });`,
    ...(rejectable
      ? [
          ``,
          `  it("no puede existir uno inválido", () => {`,
          `    expect(() =>`,
          `      ${E}.create(${sampleObject(spec, { [rejectable.name]: TYPES[rejectable.type].invalidSample ?? "" })}),`,
          `    ).toThrow(expect.objectContaining({ code: "${errorCode(names, rejectable)}" }));`,
          `  });`,
        ]
      : []),
  ];
}
