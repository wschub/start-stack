import { composeApp } from "./composition.ts";
import { type Env, EnvError, loadEnv } from "./config/env.ts";

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

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "API listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void shutdown().finally(() => process.exit(0));
    });
  });
}
