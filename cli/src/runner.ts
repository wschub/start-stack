import { spawn } from "node:child_process";

export interface RunOptions {
  cwd: string;
  env?: Record<string, string>;
}

export interface RunResult {
  code: number;
  /** Salida estándar y de error juntas, para mostrarla solo si algo falla. */
  output: string;
}

/** Ejecuta comandos externos (git, npm, docker). Se sustituye por un doble en las pruebas. */
export interface Runner {
  run(command: string, args: readonly string[], options: RunOptions): Promise<RunResult>;
}

export const processRunner: Runner = {
  run(command, args, options) {
    return new Promise((resolve) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        // En Windows npm y docker son scripts .cmd.
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
      child.on("error", (error) => resolve({ code: 127, output: error.message }));
      child.on("close", (code) => resolve({ code: code ?? 1, output }));
    });
  },
};

export async function isDockerAvailable(runner: Runner, cwd: string): Promise<boolean> {
  return (await runner.run("docker", ["info"], { cwd })).code === 0;
}
