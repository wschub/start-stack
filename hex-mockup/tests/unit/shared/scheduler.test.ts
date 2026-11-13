import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleEvery } from "../../../src/shared/scheduler.ts";

describe("scheduleEvery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ejecuta la tarea en cada intervalo y no antes", async () => {
    const task = vi.fn(async () => {});
    const scheduled = scheduleEvery(1000, task, () => {});
    await vi.advanceTimersByTimeAsync(500);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500);
    expect(task).toHaveBeenCalledTimes(3);
    scheduled.stop();
  });

  it("puede ejecutar la tarea nada más empezar", async () => {
    const task = vi.fn(async () => {});
    const scheduled = scheduleEvery(1000, task, () => {}, { runImmediately: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    scheduled.stop();
  });

  it("no solapa ejecuciones si la tarea tarda más que el intervalo", async () => {
    let finish: () => void = () => {};
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const scheduled = scheduleEvery(1000, task, () => {});
    await vi.advanceTimersByTimeAsync(3500);
    expect(task).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    scheduled.stop();
  });

  it("informa de los errores y sigue ejecutando la tarea", async () => {
    const onError = vi.fn();
    let calls = 0;
    const task = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("falló");
    });
    const scheduled = scheduleEvery(1000, task, onError);
    await vi.advanceTimersByTimeAsync(3000);
    expect(task).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    scheduled.stop();
  });

  it("stop cancela las ejecuciones futuras", async () => {
    const task = vi.fn(async () => {});
    const scheduled = scheduleEvery(1000, task, () => {});
    await vi.advanceTimersByTimeAsync(1000);
    scheduled.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
