import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { countMarker } from "./add/apply.ts";
import { MARKERS, MODULE_LAYOUT } from "./add/markers.ts";
import { namesOf, buildSpec } from "./add/spec.ts";
import { PATTERN_IDS } from "./patterns/pattern.ts";
import { PATTERNS } from "./patterns/registry.ts";
import { ARCHITECTURES, type Architecture } from "./registry.ts";
import type { Ui } from "./ui.ts";

export interface Finding {
  level: "error" | "warning";
  message: string;
}

interface Manifest {
  apps?: Record<string, unknown>[];
  [key: string]: unknown;
}

const read = (cwd: string, path: string): string | undefined => {
  const full = join(cwd, path);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
};

const subdirectories = (cwd: string, path: string): string[] => {
  const full = join(cwd, path);
  if (!existsSync(full)) return [];
  return readdirSync(full).filter((entry) => statSync(join(full, entry)).isDirectory());
};

/** Comprueba que el proyecto sigue siendo uno donde `add module` puede trabajar. No escribe nada. */
export function diagnose(cwd: string): Finding[] {
  const manifestText = read(cwd, ".scaffold.json");
  if (manifestText === undefined) {
    return [
      {
        level: "error",
        message:
          "There is no .scaffold.json here. Run doctor from the root of a start-stack project.",
      },
    ];
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(manifestText) as Manifest;
  } catch {
    return [{ level: "error", message: ".scaffold.json is not valid JSON." }];
  }
  const app = manifest.apps?.[0];
  const architecture: Architecture | undefined = ARCHITECTURES.find(
    (candidate) => candidate === app?.["architecture"],
  );
  if (!app || !architecture) {
    return [
      {
        level: "error",
        message: `The architecture in .scaffold.json is not supported (expected one of: ${ARCHITECTURES.join(", ")}).`,
      },
    ];
  }

  const findings: Finding[] = [];
  const error = (message: string) => findings.push({ level: "error", message });
  const warning = (message: string) => findings.push({ level: "warning", message });

  // 1. Marcadores
  for (const { path, marker } of MARKERS[architecture]) {
    const content = read(cwd, path);
    if (content === undefined) {
      error(`${path} does not exist (it holds the marker "// start-stack:${marker}").`);
      continue;
    }
    const count = countMarker(content, marker);
    if (count === 0) error(`${path}: the marker "// start-stack:${marker}" is missing.`);
    if (count > 1) error(`${path}: the marker "// start-stack:${marker}" appears ${count} times.`);
  }

  // 2. Manifiesto y carpetas
  const layout = MODULE_LAYOUT[architecture];
  const listed = Array.isArray(app[layout.list]) ? (app[layout.list] as string[]) : [];
  const onDisk = subdirectories(cwd, layout.dir).filter((dir) => !layout.ignore.includes(dir));
  for (const name of listed) {
    if (!onDisk.includes(name)) {
      error(
        `.scaffold.json lists "${name}" in "${layout.list}" but ${layout.dir}/${name} does not exist.`,
      );
    }
  }
  for (const dir of onDisk) {
    if (!listed.includes(dir)) {
      warning(`${layout.dir}/${dir} is not listed in "${layout.list}" of .scaffold.json.`);
    }
  }

  // 3. Cada módulo añadido está conectado: modelo, composición y migración
  const composition = read(cwd, "src/composition.ts") ?? "";
  const schema = read(cwd, "prisma/schema.prisma") ?? "";
  const migrations = join(cwd, "prisma/migrations");
  const migrationSql = existsSync(migrations)
    ? subdirectories(cwd, "prisma/migrations")
        .map((dir) => read(cwd, `prisma/migrations/${dir}/migration.sql`) ?? "")
        .join("\n")
    : "";
  for (const name of listed.filter((item) => !layout.base.includes(item))) {
    let names;
    try {
      names = namesOf(buildSpec({ module: name, fields: [] }));
    } catch {
      warning(`"${name}" in .scaffold.json is not a valid module name, so it was not checked.`);
      continue;
    }
    if (!schema.includes(`@@map("${names.moduleSnake}")`)) {
      error(
        `${name}: prisma/schema.prisma has no model mapped to the table "${names.moduleSnake}".`,
      );
    }
    if (!composition.includes(`${names.MODULE_UPPER}_PERMISSIONS`)) {
      error(`${name}: src/composition.ts does not register ${names.MODULE_UPPER}_PERMISSIONS.`);
    }
    if (!composition.includes(`${names.moduleCamel}Router`)) {
      error(`${name}: src/composition.ts does not mount ${names.moduleCamel}Router.`);
    }
    if (!migrationSql.includes(`"${names.moduleSnake}"`)) {
      warning(
        `${name}: no migration creates the table "${names.moduleSnake}". Run: npx prisma migrate dev --name add_${names.moduleSnake}`,
      );
    }
  }
  // 4. Cada patrón del manifiesto sigue conectado
  const patterns = Array.isArray(manifest["patterns"]) ? (manifest["patterns"] as string[]) : [];
  for (const id of patterns) {
    const known = PATTERN_IDS.find((candidate) => candidate === id);
    if (!known) {
      warning(`.scaffold.json lists the unknown pattern "${id}", so it was not checked.`);
      continue;
    }
    for (const check of PATTERNS[known].checks(architecture)) {
      const content = read(cwd, check.path);
      if (content === undefined || !content.includes(check.includes)) {
        error(`${id}: ${check.message} (${check.path}).`);
      }
    }
  }
  return findings;
}

/** `start-stack doctor`: muestra el diagnóstico y devuelve el código de salida. */
export function runDoctor(cwd: string, ui: Ui): number {
  const findings = diagnose(cwd);
  const errors = findings.filter((finding) => finding.level === "error");
  const warnings = findings.filter((finding) => finding.level === "warning");
  for (const finding of errors) ui.error(finding.message);
  for (const finding of warnings) ui.warn(finding.message);
  if (errors.length === 0 && warnings.length === 0) {
    ui.success("Everything is in place.");
  } else {
    ui.info(`${errors.length} problem(s), ${warnings.length} warning(s).`);
  }
  return errors.length > 0 ? 1 : 0;
}
