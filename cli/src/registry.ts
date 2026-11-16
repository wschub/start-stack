/**
 * Registro de opciones: se declara una sola vez y alimenta el asistente, las banderas, la validación
 * y los mensajes de "todavía no soportado". Una opción con `supported: false` se muestra en el
 * asistente (para que se vea el mapa del proyecto) pero no se puede elegir.
 */

export const ARCHITECTURES = ["hexagonal", "ddd", "clean"] as const;
export type Architecture = (typeof ARCHITECTURES)[number];

export type StepId = "type" | "architecture" | "language" | "auth" | "frontend" | "packageManager";

export interface Choice {
  value: string;
  label: string;
  supported: boolean;
  hint?: string;
}

export interface Step {
  id: StepId;
  /** Nombre de la bandera de la terminal: `--architecture`. */
  flag: string;
  question: string;
  choices: readonly Choice[];
  default: string;
}

export const STEPS: readonly Step[] = [
  {
    id: "type",
    flag: "type",
    question: "Project type",
    default: "monolith",
    choices: [
      { value: "monolith", label: "Monolith", supported: true, hint: "one deployable API" },
      { value: "microservices", label: "Microservices", supported: false },
    ],
  },
  {
    id: "architecture",
    flag: "architecture",
    question: "Architecture",
    default: "hexagonal",
    choices: [
      {
        value: "hexagonal",
        label: "Hexagonal",
        supported: true,
        hint: "ports and adapters, organised by modules",
      },
      {
        value: "ddd",
        label: "Domain-Driven Design",
        supported: true,
        hint: "bounded contexts, aggregates, value objects, domain events",
      },
      {
        value: "clean",
        label: "Clean Architecture",
        supported: true,
        hint: "entities, use cases, interface adapters, frameworks",
      },
      { value: "custom", label: "Custom", supported: false },
    ],
  },
  {
    id: "language",
    flag: "language",
    question: "Language",
    default: "node",
    choices: [
      { value: "node", label: "Node.js + TypeScript", supported: true },
      { value: "python", label: "Python", supported: false },
      { value: "java", label: "Java", supported: false },
      { value: "go", label: "Go", supported: false },
    ],
  },
  {
    id: "auth",
    flag: "auth",
    question: "Authentication",
    default: "jwt",
    choices: [
      {
        value: "jwt",
        label: "JWT with email and password",
        supported: true,
        hint: "rotating refresh tokens, password recovery, roles and permissions",
      },
      { value: "none", label: "None", supported: false },
      { value: "firebase", label: "Firebase", supported: false },
    ],
  },
  {
    id: "frontend",
    flag: "frontend",
    question: "Frontend",
    default: "none",
    choices: [
      { value: "none", label: "None (API only)", supported: true },
      { value: "next", label: "Next.js", supported: false },
      { value: "react-vite", label: "React + Vite", supported: false },
      { value: "angular", label: "Angular", supported: false },
    ],
  },
  {
    id: "packageManager",
    flag: "package-manager",
    question: "Package manager",
    default: "npm",
    choices: [
      { value: "npm", label: "npm", supported: true },
      { value: "pnpm", label: "pnpm", supported: false },
    ],
  },
];

export interface ArchitectureInfo {
  /** Carpeta de la maqueta de referencia de la que sale la plantilla. */
  mockup: string;
  /** Prefijo con el que la maqueta nombra su proyecto, su base de datos y su usuario. */
  prefix: string;
  /** Puerto de Postgres de la maqueta. */
  port: number;
  /** Guía para añadir la primera entidad, relativa a la raíz del proyecto. */
  guide: string;
}

export const ARCHITECTURE_INFO: Record<Architecture, ArchitectureInfo> = {
  hexagonal: {
    mockup: "hex-mockup",
    prefix: "hex",
    port: 55432,
    guide: "docs/ADDING-A-MODULE.md",
  },
  ddd: {
    mockup: "ddd-mockup",
    prefix: "ddd",
    port: 55433,
    guide: "docs/ADDING-A-CONTEXT.md",
  },
  clean: {
    mockup: "clean-mockup",
    prefix: "clean",
    port: 55434,
    guide: "docs/ADDING-A-FEATURE.md",
  },
};

/** Lo que el proyecto generado ya incluye siempre; el asistente lo muestra y no lo pregunta. */
export const FIXED_FEATURES: readonly string[] = [
  "Testing: TDD with Vitest — unit, acceptance and integration (always included)",
  "Languages of the generated project: Spanish and English",
];

export function stepById(id: StepId): Step {
  const step = STEPS.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Unknown step "${id}"`);
  return step;
}
