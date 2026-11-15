import type { DomainEvent } from "../domain/domain-event.ts";

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => Promise<void>;

/** Puerto por el que los repositorios publican los eventos de los agregados que guardan. */
export interface EventBus {
  publish(events: readonly DomainEvent[]): Promise<void>;
}

/** Para pruebas y para quien no necesita reaccionar a los eventos. */
export const NULL_EVENT_BUS: EventBus = {
  async publish(): Promise<void> {},
};

/**
 * Despachador en memoria: ejecuta los manejadores uno tras otro, en el mismo proceso y dentro de
 * la misma petición. Si un manejador falla, el error llega a quien guardó el agregado.
 *
 * Para envío asíncrono o fiable (colas, outbox) basta con otra implementación de EventBus: ni
 * los agregados ni los manejadores cambian.
 */
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe<E extends DomainEvent>(eventName: E["name"], handler: EventHandler<E>): this {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler as EventHandler);
    this.handlers.set(eventName, handlers);
    return this;
  }

  async publish(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      for (const handler of this.handlers.get(event.name) ?? []) {
        await handler(event);
      }
    }
  }
}
