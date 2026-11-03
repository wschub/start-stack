import type { ReadinessProbe } from "../ports/readiness-probe.ts";

export interface ReadinessCheck {
  name: string;
  status: "up" | "down";
}

export interface ReadinessResult {
  status: "ready" | "not_ready";
  checks: ReadinessCheck[];
}

export async function checkReadiness(
  probes: readonly ReadinessProbe[],
  options: { timeoutMs?: number } = {},
): Promise<ReadinessResult> {
  const timeoutMs = options.timeoutMs ?? 2000;

  const checks = await Promise.all(
    probes.map(async (probe): Promise<ReadinessCheck> => {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          probe.check(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
          }),
        ]);
        return { name: probe.name, status: "up" };
      } catch {
        return { name: probe.name, status: "down" };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  return {
    status: checks.every((c) => c.status === "up") ? "ready" : "not_ready",
    checks,
  };
}
