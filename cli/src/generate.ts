import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { UserError } from "./errors.ts";
import { type Architecture, ARCHITECTURE_INFO } from "./registry.ts";
import type { Tree } from "./template.ts";

export interface RenderOptions {
  name: string;
  architecture: Architecture;
  docker: boolean;
  /** Puerto de Postgres en la máquina de quien genera el proyecto. */
  dbPort: number;
  cliVersion: string;
  /** Secreto de firma de los JWT del `.env` generado. */
  jwtSecret: string;
}

/** Usuario y contraseña de la base de datos local de desarrollo. */
const DB_USER = "app";

const isText = (content: Buffer): boolean => !content.includes(0);

function replaceAll(text: string, from: string, to: string): string {
  return text.split(from).join(to);
}

/** Corta `text` desde `start` hasta `end` (sin incluirlo); sin `end`, hasta el final. */
function cut(path: string, text: string, start: string, end?: string): string {
  const from = text.indexOf(start);
  if (from === -1) throw new UserError(`The template changed: "${start}" not found in ${path}.`);
  if (end === undefined) return text.slice(0, from).trimEnd() + "\n";
  const to = text.indexOf(end, from);
  if (to === -1) throw new UserError(`The template changed: "${end}" not found in ${path}.`);
  return text.slice(0, from) + text.slice(to);
}

function edit(tree: Tree, path: string, change: (text: string) => string): void {
  const content = tree.get(path);
  if (!content) throw new UserError(`The template changed: ${path} is missing.`);
  tree.set(path, Buffer.from(change(content.toString("utf8"))));
}

/**
 * Convierte la plantilla (una maqueta de referencia) en un proyecto nuevo: lo renombra, ajusta lo que
 * solo tenía sentido dentro del repositorio de maquetas (los hooks de git) y aplica las opciones.
 * Es una función pura sobre árboles en memoria: no toca el disco.
 */
export function renderProject(template: Tree, options: RenderOptions): Tree {
  const info = ARCHITECTURE_INFO[options.architecture];
  const snake = options.name.replaceAll("-", "_");
  const tree: Tree = new Map();

  // Identificadores de la maqueta → los del proyecto nuevo.
  const replacements: [string, string][] = [
    [`${info.prefix}-mockup`, options.name],
    [`${info.prefix}_mockup`, snake],
    [`${info.prefix}:${info.prefix}@`, `${DB_USER}:${DB_USER}@`],
    [`POSTGRES_USER: ${info.prefix}`, `POSTGRES_USER: ${DB_USER}`],
    [`POSTGRES_PASSWORD: ${info.prefix}`, `POSTGRES_PASSWORD: ${DB_USER}`],
    [`pg_isready -U ${info.prefix} `, `pg_isready -U ${DB_USER} `],
    [String(info.port), String(options.dbPort)],
  ];

  for (const [path, content] of template) {
    const target = path.replace(/(^|\/)_gitignore$/, "$1.gitignore");
    if (!isText(content)) {
      tree.set(target, content);
      continue;
    }
    // El lockfile solo lleva el nombre del proyecto: el resto de sustituciones podrían
    // coincidir por casualidad con un tramo de un hash de integridad.
    const pairs = path === "package-lock.json" ? replacements.slice(0, 1) : replacements;
    let text = content.toString("utf8");
    for (const [from, to] of pairs) text = replaceAll(text, from, to);
    tree.set(target, Buffer.from(text));
  }

  // La maqueta vive dentro de un repositorio con los hooks en la raíz; el proyecto nuevo es la raíz.
  edit(tree, "package.json", (text) => text.replace(/"prepare": "[^"]*"/, '"prepare": "husky"'));
  for (const hook of [".husky/pre-commit", ".husky/pre-push"]) {
    edit(tree, hook, (text) => text.replace(/^cd .*\r?\n/m, ""));
  }

  edit(tree, ".scaffold.json", (text) =>
    text
      .replace(/"cliVersion": "[^"]*"/, `"cliVersion": "${options.cliVersion}"`)
      .replace(/"docker": (true|false)/, `"docker": ${String(options.docker)}`),
  );

  if (!options.docker) removeDocker(tree);

  // Un .env listo para desarrollar: el de ejemplo, con un secreto propio.
  const example = tree.get(".env.example")?.toString("utf8") ?? "";
  tree.set(
    ".env",
    Buffer.from(
      example.replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${options.jwtSecret}`),
    ),
  );

  return tree;
}

/** Quita la imagen de la API: queda el Postgres local de desarrollo y nada más. */
function removeDocker(tree: Tree): void {
  tree.delete("Dockerfile");
  tree.delete(".dockerignore");

  edit(tree, "docker-compose.yml", (text) =>
    cut("docker-compose.yml", text, "\n  # Los dos servicios", "\nvolumes:"),
  );
  edit(tree, ".github/workflows/ci.yml", (text) =>
    cut(".github/workflows/ci.yml", text, "      - name: Construir las imágenes"),
  );
  edit(tree, ".github/dependabot.yml", (text) =>
    cut(".github/dependabot.yml", text, "\n  - package-ecosystem: docker"),
  );
  edit(tree, "README.md", (text) =>
    cut("README.md", text, "## Docker\n", "## Despliegue sin Docker"),
  );
  edit(tree, "README.en.md", (text) =>
    cut("README.en.md", text, "## Docker\n", "## Deploying without Docker"),
  );
}

export function generateJwtSecret(): string {
  return randomBytes(48).toString("base64url");
}

/** Escribe el árbol en disco, creando las carpetas que falten. */
export function writeTree(root: string, tree: Tree): void {
  for (const [path, content] of tree) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
