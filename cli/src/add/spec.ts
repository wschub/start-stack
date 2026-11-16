import { UserError } from "../errors.ts";

export const FIELD_TYPES = ["string", "int", "boolean", "datetime"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface Field {
  /** camelCase: `priceCents`. */
  name: string;
  type: FieldType;
}

export interface ModuleSpec {
  /** Carpeta, tabla, ruta y permisos: `order-items`. Se usa tal como se escribe. */
  module: string;
  /** Nombre de la entidad en singular: `order-item`. Por defecto, el del módulo. */
  entity: string;
  fields: Field[];
}

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const CAMEL = /^[a-z][a-zA-Z0-9]*$/;
const MAX_NAME = 40;

/** Nombres que ya usa el proyecto base o que chocarían con variables de la composición. */
const RESERVED_MODULES = new Set([
  "auth",
  "users",
  "roles",
  "session",
  "password",
  "health",
  "identity",
  "permissions",
  "shared",
  "platform",
  "generated",
  "config",
  "cli",
  "app",
  "events",
  "messaging",
  "outbox",
]);

/** Nombres que la entidad generada ya usa para otra cosa. */
const RESERVED_FIELDS = new Set([
  "id",
  "publicId",
  "createdAt",
  "updatedAt",
  "input",
  "props",
  "now",
  "options",
  "state",
  "events",
  "invalid",
  "pullEvents",
  "toProps",
  "create",
  "restore",
  "constructor",
]);

export const DEFAULT_FIELDS: readonly Field[] = [{ name: "name", type: "string" }];

function assertKebab(value: string, what: string): void {
  if (value.length > MAX_NAME || !KEBAB.test(value)) {
    throw new UserError(
      `Invalid ${what} "${value}". Use lowercase letters, digits and single hyphens, starting with a letter (e.g. order-items).`,
    );
  }
}

/** Interpreta `priceCents:int`. Sin tipo, es `string`. */
export function parseField(raw: string): Field {
  const [name = "", type = "string", ...rest] = raw.split(":");
  if (rest.length > 0 || !CAMEL.test(name) || name.length > MAX_NAME) {
    throw new UserError(
      `Invalid field "${raw}". Use name:type with a camelCase name, e.g. priceCents:int.`,
    );
  }
  if (RESERVED_FIELDS.has(name)) {
    throw new UserError(`The field name "${name}" is reserved. Pick another one.`);
  }
  const known = FIELD_TYPES.find((candidate) => candidate === type);
  if (!known) {
    throw new UserError(
      `Unknown type "${type}" in field "${raw}". Valid types: ${FIELD_TYPES.join(", ")}.`,
    );
  }
  return { name, type: known };
}

export function buildSpec(input: {
  module: string;
  entity?: string | undefined;
  fields: readonly string[];
}): ModuleSpec {
  assertKebab(input.module, "module name");
  if (RESERVED_MODULES.has(input.module)) {
    throw new UserError(`The module name "${input.module}" is reserved by the base project.`);
  }
  const entity = input.entity ?? input.module;
  assertKebab(entity, "entity name");

  const fields = input.fields.length > 0 ? input.fields.map(parseField) : [...DEFAULT_FIELDS];
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.name)) throw new UserError(`The field "${field.name}" is repeated.`);
    seen.add(field.name);
  }
  return { module: input.module, entity, fields };
}

const words = (kebab: string): string[] => kebab.split("-");
const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export const pascal = (kebab: string): string => words(kebab).map(capitalize).join("");
export const camel = (kebab: string): string => {
  const [first = "", ...rest] = words(kebab);
  return first + rest.map(capitalize).join("");
};
export const snake = (kebab: string): string => kebab.replaceAll("-", "_");
export const upper = (kebab: string): string => snake(kebab).toUpperCase();
/** `priceCents` → `price-cents`. */
export const kebabOfCamel = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** Todos los nombres derivados que usan las plantillas. */
export interface Names {
  module: string;
  moduleCamel: string;
  ModulePascal: string;
  MODULE_UPPER: string;
  /** Nombre de la tabla. */
  moduleSnake: string;
  entity: string;
  entityCamel: string;
  EntityPascal: string;
  ENTITY_UPPER: string;
}

export function namesOf(spec: ModuleSpec): Names {
  return {
    module: spec.module,
    moduleCamel: camel(spec.module),
    ModulePascal: pascal(spec.module),
    MODULE_UPPER: upper(spec.module),
    moduleSnake: snake(spec.module),
    entity: spec.entity,
    entityCamel: camel(spec.entity),
    EntityPascal: pascal(spec.entity),
    ENTITY_UPPER: upper(spec.entity),
  };
}

export const errorCode = (names: Names, field: Field): string =>
  `INVALID_${names.ENTITY_UPPER}_${upper(kebabOfCamel(field.name))}`;

interface TypeInfo {
  /** Tipo dentro de la entidad. */
  domain: string;
  /** Tipo con el que llega a la aplicación y sale de ella (JSON). */
  wire: string;
  zod: string;
  prisma: string;
  /** Valor válido de ejemplo, como literal de TypeScript/JSON. */
  sample: string;
  /** Valor que el esquema acepta pero la entidad rechaza; undefined si no existe. */
  invalidSample: string | undefined;
}

export const TYPES: Record<FieldType, TypeInfo> = {
  string: {
    domain: "string",
    wire: "string",
    zod: "z.string().max(500)",
    prisma: "String",
    sample: '"Sample"',
    invalidSample: '"   "',
  },
  int: {
    domain: "number",
    wire: "number",
    zod: "z.number().int()",
    prisma: "Int",
    sample: "42",
    invalidSample: undefined,
  },
  boolean: {
    domain: "boolean",
    wire: "boolean",
    zod: "z.boolean()",
    prisma: "Boolean",
    sample: "true",
    invalidSample: undefined,
  },
  datetime: {
    domain: "Date",
    wire: "string",
    zod: "z.string().max(40)",
    prisma: "DateTime",
    sample: '"2026-01-15T10:00:00.000Z"',
    invalidSample: '"not-a-date"',
  },
};

/** `{ name: "Sample", priceCents: 42 }` */
export function sampleObject(spec: ModuleSpec, overrides: Record<string, string> = {}): string {
  const entries = spec.fields.map(
    (field) => `${field.name}: ${overrides[field.name] ?? TYPES[field.type].sample}`,
  );
  return `{ ${entries.join(", ")} }`;
}

/** Primer campo con un valor que solo rechaza la entidad, para las pruebas generadas. */
export function rejectableField(spec: ModuleSpec): Field | undefined {
  return spec.fields.find((field) => TYPES[field.type].invalidSample !== undefined);
}
