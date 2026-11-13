export interface ScheduledTask {
  stop(): void;
}

/**
 * Ejecuta una tarea cada cierto tiempo, sin solapar ejecuciones. Un error se informa y no detiene
 * la planificación. El temporizador no mantiene vivo el proceso.
 */
export function scheduleEvery(
  intervalMs: number,
  task: () => Promise<void>,
  onError: (error: unknown) => void,
  options: { runImmediately?: boolean } = {},
): ScheduledTask {
  let running = false;

  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void run();
  }, intervalMs);
  timer.unref();
  if (options.runImmediately) void run();

  return { stop: () => clearInterval(timer) };
}
