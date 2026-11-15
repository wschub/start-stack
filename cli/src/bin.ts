#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { main } from "./cli.ts";
import { findFreePort } from "./ports.ts";
import { processRunner } from "./runner.ts";
import { CLI_ROOT } from "./template.ts";
import { clackPrompter, clackUi } from "./ui.ts";

const { version } = JSON.parse(readFileSync(`${CLI_ROOT}/package.json`, "utf8")) as {
  version: string;
};

process.exitCode = await main(process.argv.slice(2), {
  prompter: clackPrompter,
  ui: clackUi,
  runner: processRunner,
  cwd: process.cwd(),
  cliVersion: version,
  findFreePort: () => findFreePort(),
});
