import { createServer } from "node:net";

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

/** Primer puerto libre a partir de `start`: así dos proyectos generados no chocan entre sí. */
export async function findFreePort(
  start = 55432,
  isPortFree: (port: number) => Promise<boolean> = isFree,
): Promise<number> {
  for (let port = start; port < start + 200; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found from ${start} to ${start + 199}.`);
}
