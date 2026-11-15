import type { DomainEvent } from "../../src/shared/domain/domain-event.ts";
import type { EventBus } from "../../src/shared/events/event-bus.ts";

/** Bus que solo anota lo que se publica, para comprobar qué eventos salen al guardar un agregado. */
export class RecordingEventBus implements EventBus {
  readonly published: DomainEvent[] = [];

  async publish(events: readonly DomainEvent[]): Promise<void> {
    this.published.push(...events);
  }

  names(): string[] {
    return this.published.map((event) => event.name);
  }
}
