import { UserError } from "../errors.ts";
import type { Rendered } from "./common.ts";

export interface Plan {
  /** Archivos nuevos: ruta → contenido. */
  created: Map<string, string>;
  /** Archivos existentes con las inserciones ya hechas: ruta → contenido nuevo. */
  updated: Map<string, string>;
}

const markerPattern = (marker: string): RegExp =>
  new RegExp(`^[ \\t]*(//|#) start-stack:${marker}[ \\t]*$`, "gm");

/**
 * Inserta `insertion` justo encima de la línea del marcador. Se niega si el marcador falta o está
 * repetido: tocar el archivo a ciegas dejaría el proyecto en un estado que nadie sabe explicar.
 */
export function insertAboveMarker(
  path: string,
  content: string,
  marker: string,
  insertion: readonly string[],
): string {
  const matches = [...content.matchAll(markerPattern(marker))];
  if (matches.length !== 1 || matches[0]?.index === undefined) {
    const problem = matches.length === 0 ? "is missing" : "appears more than once";
    throw new UserError(
      `The marker "// start-stack:${marker}" ${problem} in ${path}. ` +
        `Nothing was written. Restore the comment (see docs/ARCHITECTURE.md) and run the command again.`,
    );
  }
  const at = matches[0].index;
  return `${content.slice(0, at)}${insertion.join("\n")}\n${content.slice(at)}`;
}

/**
 * Comprueba todo antes de escribir nada: que ningún archivo nuevo exista y que todos los marcadores
 * estén. `read` devuelve el contenido de un archivo del proyecto o `undefined` si no existe.
 */
export function planChanges(rendered: Rendered, read: (path: string) => string | undefined): Plan {
  const clashes = [...rendered.files.keys()].filter((path) => read(path) !== undefined);
  if (clashes.length > 0) {
    throw new UserError(
      `These files already exist, so nothing was written:\n${clashes.map((path) => `  ${path}`).join("\n")}`,
    );
  }

  const updated = new Map<string, string>();
  for (const edit of rendered.edits) {
    const current = updated.get(edit.path) ?? read(edit.path);
    if (current === undefined) {
      throw new UserError(`${edit.path} does not exist. Is this a start-stack project?`);
    }
    updated.set(edit.path, insertAboveMarker(edit.path, current, edit.marker, edit.lines));
  }
  return { created: new Map(rendered.files), updated };
}
