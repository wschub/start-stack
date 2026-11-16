import * as clack from "@clack/prompts";
import { CancelError } from "./errors.ts";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  /** Texto largo bajo el título; en la terminal sustituye a la pista que va al lado. */
  description?: string;
}

/** Parte una línea en varias que caben en `width`; todas con sangría de dos espacios. */
function wrap(line: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of line.split(" ")) {
    if (current !== "" && current.length + 1 + word.length > width - 2) {
      lines.push(`  ${current}`);
      current = word;
    } else {
      current = current === "" ? word : `${current} ${word}`;
    }
  }
  lines.push(`  ${current}`);
  return lines;
}

/** Con descripción: título, pista al lado y el texto debajo (clack solo enseña la pista de la opción activa). */
function selectOption(option: SelectOption): { value: string; label: string; hint?: string } {
  if (option.description === undefined) {
    return {
      value: option.value,
      label: option.label,
      ...(option.hint === undefined ? {} : { hint: option.hint }),
    };
  }
  const title = option.hint === undefined ? option.label : `${option.label} (${option.hint})`;
  const width = Math.max(40, (process.stdout.columns ?? 80) - 14);
  const body = option.description
    .split("\n")
    .flatMap((line) => wrap(line, width))
    .join("\n");
  return { value: option.value, label: `${title}\n${body}\n` };
}

/** Todo lo que el CLI pregunta al usuario. Se sustituye por un doble con respuestas en las pruebas. */
export interface Prompter {
  text(question: {
    message: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
  password(question: {
    message: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
  select(question: {
    message: string;
    options: readonly SelectOption[];
    initial: string;
  }): Promise<string>;
  confirm(question: { message: string; initial: boolean }): Promise<boolean>;
  /** Varias opciones a la vez; puede devolver una lista vacía. */
  multiselect(question: {
    message: string;
    options: readonly SelectOption[];
    initial: readonly string[];
  }): Promise<string[]>;
}

/** Todo lo que el CLI muestra al usuario. */
export interface Ui {
  intro(title: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  note(message: string, title: string): void;
  outro(message: string): void;
  /** Muestra un indicador mientras corre `work`. Si lanza, lo marca como fallido y relanza. */
  task<T>(title: string, work: () => Promise<T>): Promise<T>;
}

function answer<T>(value: T | symbol): T {
  if (clack.isCancel(value)) throw new CancelError();
  return value as T;
}

export const clackPrompter: Prompter = {
  async text({ message, placeholder, validate }) {
    return answer<string>(
      await clack.text({
        message,
        ...(placeholder === undefined ? {} : { placeholder }),
        ...(validate ? { validate: (value) => validate(value ?? "") } : {}),
      }),
    );
  },
  async password({ message, validate }) {
    return answer<string>(
      await clack.password({
        message,
        ...(validate ? { validate: (value) => validate(value ?? "") } : {}),
      }),
    );
  },
  async select({ message, options, initial }) {
    return answer<string>(
      await clack.select({
        message,
        options: options.map(selectOption),
        initialValue: initial,
      }),
    );
  },
  async multiselect({ message, options, initial }) {
    return answer<string[]>(
      await clack.multiselect({
        message,
        required: false,
        options: options.map((option) => ({
          value: option.value,
          label: option.label,
          ...(option.hint === undefined ? {} : { hint: option.hint }),
        })),
        initialValues: [...initial],
      }),
    );
  },
  async confirm({ message, initial }) {
    return answer<boolean>(await clack.confirm({ message, initialValue: initial }));
  },
};

export const clackUi: Ui = {
  intro: (title) => clack.intro(title),
  info: (message) => clack.log.info(message),
  warn: (message) => clack.log.warn(message),
  error: (message) => clack.log.error(message),
  success: (message) => clack.log.success(message),
  note: (message, title) => clack.note(message, title),
  outro: (message) => clack.outro(message),
  async task(title, work) {
    const spinner = clack.spinner();
    spinner.start(title);
    try {
      const result = await work();
      spinner.stop(title);
      return result;
    } catch (error) {
      spinner.error(`${title} — failed`);
      throw error;
    }
  },
};
