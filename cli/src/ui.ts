import * as clack from "@clack/prompts";
import { CancelError } from "./errors.ts";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
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
        options: options.map((option) => ({
          value: option.value,
          label: option.label,
          ...(option.hint === undefined ? {} : { hint: option.hint }),
        })),
        initialValue: initial,
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
