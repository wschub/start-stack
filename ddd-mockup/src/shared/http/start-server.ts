import type { Express } from "express";
import type { Server } from "node:http";

export function startServer(app: Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, (error?: Error) => {
      if (error) reject(error);
      else resolve(server);
    });
  });
}
