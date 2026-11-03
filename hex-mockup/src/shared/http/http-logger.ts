import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function httpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers["x-request-id"];
      const id =
        typeof incoming === "string" && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    autoLogging: {
      ignore: (req) => {
        const path = req.url?.split("?")[0] ?? "";
        return path === "/health" || path.startsWith("/health/");
      },
    },
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
      censor: "[redacted]",
    },
  });
}
