import { UserError } from "./errors.ts";
import { type Architecture, type Step, STEPS, stepById } from "./registry.ts";

export interface ProjectOptions {
  name: string;
  type: "monolith";
  architecture: Architecture;
  language: "node";
  auth: "jwt";
  frontend: "none";
  packageManager: "npm";
  docker: boolean;
  git: boolean;
  install: boolean;
  database: boolean;
}

const NAME_PATTERN = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;
const MAX_NAME_LENGTH = 50;

/** Devuelve el motivo por el que el nombre no sirve, o undefined si es válido. */
export function validateProjectName(name: string): string | undefined {
  if (name.length === 0) return "The project name is required.";
  if (name.length > MAX_NAME_LENGTH) return `Use at most ${MAX_NAME_LENGTH} characters.`;
  if (!NAME_PATTERN.test(name)) {
    return "Use lowercase letters, digits and hyphens; start with a letter and do not end with a hyphen.";
  }
  return undefined;
}

/** Comprueba que un valor es una opción conocida y soportada de un paso del asistente. */
export function validateChoice(step: Step, value: string): void {
  const choice = step.choices.find((candidate) => candidate.value === value);
  if (!choice) {
    const valid = step.choices.map((candidate) => candidate.value).join(", ");
    throw new UserError(`Unknown ${step.flag} "${value}". Valid values: ${valid}.`);
  }
  if (!choice.supported) {
    throw new UserError(`${step.flag} "${value}" is not supported yet.`);
  }
}

export function isSupported(step: Step, value: string): boolean {
  return step.choices.some((choice) => choice.value === value && choice.supported);
}

/** Valores por defecto de cada paso, ya validados. */
export function defaultChoices(): Record<string, string> {
  return Object.fromEntries(STEPS.map((step) => [step.id, step.default]));
}

export function assertSupportedDefaults(): void {
  for (const step of STEPS) validateChoice(stepById(step.id), step.default);
}
