import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        // Genera proyectos de verdad, instala sus dependencias y ejecuta su `verify` (necesita Docker).
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          testTimeout: 20 * 60_000,
          hookTimeout: 20 * 60_000,
        },
      },
    ],
  },
});
