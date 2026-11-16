import { SelectPrompt } from "@clack/core";
import * as clack from "@clack/prompts";
import { styleText } from "node:util";
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

/**
 * Pregunta con una descripción bajo cada opción. `clack.select` repetiría la descripción entera al
 * confirmar (usa la misma etiqueta), así que aquí se pinta con `SelectPrompt`: al confirmar solo queda el título.
 */
async function selectWithDescriptions(
  message: string,
  options: readonly SelectOption[],
  initial: string | undefined,
): Promise<string | symbol> {
  const width = Math.max(40, (process.stdout.columns ?? 80) - 14);
  const title = (option: SelectOption) =>
    option.hint === undefined ? option.label : `${option.label} (${option.hint})`;
  const prompt = new SelectPrompt<SelectOption>({
    options: [...options],
    ...(initial === undefined ? {} : { initialValue: initial }),
    render() {
      const bar = styleText("gray", "│");
      const marks: Record<string, string> = { submit: "◇", cancel: "■" };
      const head = `${bar}\n${styleText("cyan", marks[this.state] ?? "◆")}  ${message}\n`;
      const chosen = options[this.cursor];
      if (this.state === "submit")
        return `${head}${bar}  ${styleText("dim", chosen?.label ?? "")}\n`;
      if (this.state === "cancel") {
        return `${head}${bar}  ${styleText(["strikethrough", "dim"], chosen?.label ?? "")}\n${bar}\n`;
      }
      const lines = options.flatMap((option, index) => {
        const active = index === this.cursor;
        const mark = active ? styleText("green", "●") : styleText("dim", "○");
        const body = (option.description ?? "")
          .split("\n")
          .filter((line) => line !== "")
          .flatMap((line) => wrap(line, width));
        const text = [`${mark} ${title(option)}`, ...body.map((line) => styleText("dim", line))];
        return [...text.map((line) => `${bar}  ${line}`), bar];
      });
      const help = `${styleText("dim", "↑/↓")} to navigate • ${styleText("dim", "Enter:")} confirm`;
      return `${head}${lines.join("\n")}\n${bar}  ${help}\n${styleText("gray", "└")}\n`;
    },
  });
  return prompt.prompt() as Promise<string | symbol>;
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
    if (options.some((option) => option.description !== undefined)) {
      return answer<string>(await selectWithDescriptions(message, options, initial));
    }
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
