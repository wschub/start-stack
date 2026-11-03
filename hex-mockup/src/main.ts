import type { Server } from "node:http";
import { composeApp } from "./composition.ts";
import { type Env, EnvError, loadEnv } from "./config/env.ts";
import { startServer } from "./shared/http/start-server.ts";

function readEnv(): Env {
  try {
    return loadEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const env = readEnv();
const { app, logger, shutdown } = composeApp(env);

let server: Server;
try {
  server = await startServer(app, env.PORT);
} catch (error) {
  logger.fatal({ err: error }, "could not start the server");
  process.exit(1);
}
logger.info({ port: env.PORT }, "API listening");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void shutdown().finally(() => process.exit(0));
    });
  });
}
