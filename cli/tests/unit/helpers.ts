import type { Dependencies } from "../../src/cli.ts";
import type { RunOptions, RunResult, Runner } from "../../src/runner.ts";
import type { Prompter, SelectOption, Ui } from "../../src/ui.ts";

export interface RecordedRun {
  command: string;
  args: readonly string[];
  options: RunOptions;
}

/** Runner que anota lo que se le pide y responde según una función (por defecto, todo sale bien). */
export class FakeRunner implements Runner {
  readonly runs: RecordedRun[] = [];
  private readonly respond: (run: RecordedRun) => RunResult;

  constructor(respond: (run: RecordedRun) => RunResult = () => ({ code: 0, output: "" })) {
    this.respond = respond;
  }

  async run(command: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
    const run = { command, args, options };
    this.runs.push(run);
    return this.respond(run);
  }

  /** Comandos como texto: "npm run db:migrate". */
  commands(): string[] {
    return this.runs.map((run) => [run.command, ...run.args].join(" "));
  }
}

/** Interfaz que anota lo que se muestra. */
export class FakeUi implements Ui {
  readonly lines: string[] = [];

  intro(title: string) {
    this.lines.push(`intro:${title}`);
  }
  info(message: string) {
    this.lines.push(`info:${message}`);
  }
  warn(message: string) {
    this.lines.push(`warn:${message}`);
  }
  error(message: string) {
    this.lines.push(`error:${message}`);
  }
  success(message: string) {
    this.lines.push(`success:${message}`);
  }
  note(message: string, title: string) {
    this.lines.push(`note:${title}:${message}`);
  }
  outro(message: string) {
    this.lines.push(`outro:${message}`);
  }
  async task<T>(title: string, work: () => Promise<T>): Promise<T> {
    this.lines.push(`task:${title}`);
    return work();
  }

  has(fragment: string): boolean {
    return this.lines.some((line) => line.includes(fragment));
  }
}

/** Respuestas en el orden en que se piden. Si se pide una que no hay, la prueba falla. */
export class ScriptedPrompter implements Prompter {
  readonly asked: string[] = [];
  readonly selectOptions: Record<string, readonly SelectOption[]> = {};
  private readonly answers: (string | boolean)[];

  constructor(answers: (string | boolean)[]) {
    this.answers = [...answers];
  }

  private next(message: string): string | boolean {
    this.asked.push(message);
    const answer = this.answers.shift();
    if (answer === undefined) throw new Error(`Unexpected question: "${message}"`);
    return answer;
  }

  async text(question: { message: string; validate?: (value: string) => string | undefined }) {
    const answer = String(this.next(question.message));
    const problem = question.validate?.(answer);
    if (problem)
      throw new Error(`Invalid answer "${answer}" for "${question.message}": ${problem}`);
    return answer;
  }
  async password(question: { message: string; validate?: (value: string) => string | undefined }) {
    return this.text(question);
  }
  async select(question: { message: string; options: readonly SelectOption[] }) {
    this.selectOptions[question.message] = question.options;
    return String(this.next(question.message));
  }
  async confirm(question: { message: string }) {
    return Boolean(this.next(question.message));
  }

  get remaining(): number {
    return this.answers.length;
  }
}

export function dependencies(overrides: Partial<Dependencies> & { cwd: string }): Dependencies {
  return {
    prompter: new ScriptedPrompter([]),
    ui: new FakeUi(),
    runner: new FakeRunner(),
    cliVersion: "9.9.9",
    findFreePort: async () => 55432,
    ...overrides,
  };
}
