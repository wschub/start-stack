import type { Rendered } from "../add/common.ts";
import type { Architecture } from "../registry.ts";

export const PATTERN_IDS = ["outbox"] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export interface PatternContext {
  architecture: Architecture;
  /** Carpetas que ya hay en `prisma/migrations`, para que la nueva quede la última. */
  migrations: readonly string[];
  now: Date;
}

/** Algo que debe seguir existiendo en el proyecto para que el patrón funcione; lo revisa `doctor`. */
export interface PatternCheck {
  path: string;
  includes: string;
  message: string;
}

export interface Pattern {
  id: PatternId;
  label: string;
  /** Qué resuelve, en una frase. Se muestra junto a la opción en el asistente. */
  summary: string;
  /** Dónde encaja más, por arquitectura. Se muestra en el asistente. */
  fit: string;
  requires: readonly PatternId[];
  conflicts: readonly PatternId[];
  /** Archivos nuevos e inserciones sobre los marcadores de `docs/ARCHITECTURE.md`. */
  render(context: PatternContext): Rendered;
  checks(architecture: Architecture): PatternCheck[];
}

/** `20261116101530_add_outbox`, siempre posterior a las migraciones existentes. */
export function migrationName(existing: readonly string[], now: Date, name: string): string {
  const stamp = now.toISOString().replaceAll(/[-:T]/g, "").slice(0, 14);
  const last = existing
    .map((dir) => dir.slice(0, 14))
    .filter((prefix) => /^\d{14}$/.test(prefix))
    .sort()
    .at(-1);
  const next = last !== undefined && last >= stamp ? String(BigInt(last) + 1n) : stamp;
  return `${next}_${name}`;
}
