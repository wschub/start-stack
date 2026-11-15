import type { Server } from "node:http";
import { composeApp } from "./composition.ts";
import { type Env, EnvError, loadEnv } from "./config/env.ts";
import { startServer } from "../frameworks/express/start-server.ts";
import { scheduleEvery } from "../frameworks/scheduler.ts";

const TOKEN_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

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
const { app, logger, shutdown, purgeExpiredTokens, purgeExpiredPasswordResets } = composeApp(env);

let server: Server;
try {
  server = await startServer(app, env.PORT);
} catch (error) {
  logger.fatal({ err: error }, "could not start the server");
  process.exit(1);
}
logger.info({ port: env.PORT }, "API listening");

const cleanup = scheduleEvery(
  TOKEN_CLEANUP_INTERVAL_MS,
  async () => {
    const removed = await purgeExpiredTokens.execute();
    const removedResets = await purgeExpiredPasswordResets.execute();
    logger.info({ removed, removedResets }, "expired refresh tokens and password resets purged");
  },
  (error) => logger.error({ err: error }, "expired token cleanup failed"),
  { runImmediately: true },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    cleanup.stop();
    server.close(() => {
      void shutdown().finally(() => process.exit(0));
    });
  });
}
