import { UserError } from "../errors.ts";
import { OUTBOX } from "./outbox.ts";
import { PATTERN_IDS, type Pattern, type PatternId } from "./pattern.ts";

export const PATTERNS: Record<PatternId, Pattern> = { outbox: OUTBOX };

/** Patrones previstos que todavía no existen: el asistente los muestra como "coming soon". */
export const COMING_PATTERNS: readonly { label: string; hint: string }[] = [
  { label: "Cloud Tasks", hint: "cola gestionada de Google Cloud, como adaptador del outbox" },
  { label: "Kafka", hint: "broker de eventos, como adaptador del outbox" },
  { label: "Saga", hint: "transacciones largas entre servicios con compensaciones" },
];

export function patternById(id: string): Pattern {
  const found = PATTERN_IDS.find((candidate) => candidate === id);
  if (!found) {
    throw new UserError(`Unknown pattern "${id}". Valid patterns: ${PATTERN_IDS.join(", ")}.`);
  }
  return PATTERNS[found];
}

/** Comprueba que el conjunto elegido es coherente: sin repetidos, con lo que cada uno requiere y sin choques. */
export function validatePatternSet(ids: readonly string[]): PatternId[] {
  const patterns = ids.map(patternById);
  const chosen = new Set(patterns.map((pattern) => pattern.id));
  if (chosen.size !== patterns.length) throw new UserError("A pattern was given more than once.");
  for (const pattern of patterns) {
    for (const required of pattern.requires) {
      if (!chosen.has(required)) {
        throw new UserError(`The pattern "${pattern.id}" requires "${required}".`);
      }
    }
    for (const conflict of pattern.conflicts) {
      if (chosen.has(conflict)) {
        throw new UserError(`The patterns "${pattern.id}" and "${conflict}" cannot be combined.`);
      }
    }
  }
  return patterns.map((pattern) => pattern.id);
}

/** Orden de aplicación: cada patrón después de los que requiere. */
export function inApplicationOrder(ids: readonly PatternId[]): PatternId[] {
  const ordered: PatternId[] = [];
  const visit = (id: PatternId) => {
    if (ordered.includes(id)) return;
    for (const required of PATTERNS[id].requires) visit(required);
    ordered.push(id);
  };
  for (const id of ids) visit(id);
  return ordered;
}
