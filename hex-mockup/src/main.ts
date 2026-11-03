import { composeApp } from "./composition.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL no está definida");

const port = Number(process.env.PORT ?? 3000);
const { app, shutdown } = composeApp(databaseUrl);

const server = app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void shutdown().finally(() => process.exit(0));
    });
  });
}
