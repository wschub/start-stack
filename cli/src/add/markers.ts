import type { Architecture } from "../registry.ts";

export interface MarkerSite {
  path: string;
  /** `imports` es `// start-stack:imports`. */
  marker: string;
}

const COMPOSITION = ["imports", "permissions", "wiring", "routers"].map((marker) => ({
  path: "src/composition.ts",
  marker,
}));
const SCHEMA = { path: "prisma/schema.prisma", marker: "models" };
const messages = (path: string): MarkerSite[] =>
  ["messages-en", "messages-es"].map((marker) => ({ path, marker }));

/** Todos los marcadores que `add module` necesita, por arquitectura. */
export const MARKERS: Record<Architecture, readonly MarkerSite[]> = {
  hexagonal: [...COMPOSITION, SCHEMA, ...messages("src/shared/i18n/messages.ts")],
  ddd: [...COMPOSITION, SCHEMA, ...messages("src/shared/i18n/messages.ts")],
  clean: [...COMPOSITION, SCHEMA, ...messages("src/interface-adapters/presenters/messages.ts")],
};

/** Dónde vive cada módulo (o contexto) y cuáles trae la base del proyecto. */
export const MODULE_LAYOUT: Record<
  Architecture,
  { dir: string; base: readonly string[]; ignore: readonly string[]; list: "modules" | "contexts" }
> = {
  hexagonal: { dir: "src/modules", base: ["auth", "users"], ignore: ["health"], list: "modules" },
  ddd: { dir: "src/contexts", base: ["identity"], ignore: [], list: "contexts" },
  clean: {
    dir: "src/use-cases",
    base: ["auth", "users"],
    ignore: ["health", "permissions", "ports"],
    list: "modules",
  },
};
