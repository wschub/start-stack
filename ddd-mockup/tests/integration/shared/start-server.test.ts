import express from "express";
import { type AddressInfo, createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { startServer } from "../../../src/shared/http/start-server.ts";

describe("startServer", () => {
  it("rechaza con EADDRINUSE si el puerto está ocupado", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, resolve));
    const { port } = blocker.address() as AddressInfo;
    try {
      await expect(startServer(express(), port)).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      blocker.close();
    }
  });

  it("resuelve con el servidor escuchando cuando el puerto está libre", async () => {
    const server = await startServer(express(), 0);
    try {
      expect((server.address() as AddressInfo).port).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
