import { describe, expect, it } from "vitest";
import { AggregateRoot } from "../../../../src/shared/domain/aggregate-root.ts";
import type { DomainEvent } from "../../../../src/shared/domain/domain-event.ts";

const AT = new Date("2026-11-15T10:00:00Z");
const event = (name: string): DomainEvent => ({ name, occurredAt: AT });

/** Agregado mínimo e inmutable, como los de la aplicación: cada cambio devuelve otra instancia. */
class Counter extends AggregateRoot {
  readonly value: number;

  private constructor(value: number, events: readonly DomainEvent[] = []) {
    super(events);
    this.value = value;
  }

  static start(): Counter {
    return new Counter(0, [event("counter.started")]);
  }

  static restore(value: number): Counter {
    return new Counter(value);
  }

  increment(): Counter {
    return new Counter(this.value + 1, [...this.events, event("counter.incremented")]);
  }
}

describe("AggregateRoot", () => {
  it("un agregado reconstruido no tiene eventos pendientes", () => {
    expect(Counter.restore(3).pullEvents()).toEqual([]);
  });

  it("entrega los eventos en el orden en que ocurrieron", () => {
    const counter = Counter.start().increment().increment();

    expect(counter.pullEvents().map(({ name }) => name)).toEqual([
      "counter.started",
      "counter.incremented",
      "counter.incremented",
    ]);
  });

  it("pullEvents vacía los pendientes: publicar dos veces no repite eventos", () => {
    const counter = Counter.start();

    expect(counter.pullEvents()).toHaveLength(1);
    expect(counter.pullEvents()).toEqual([]);
  });

  it("la instancia nueva hereda los eventos sin compartir la lista con la anterior", () => {
    const started = Counter.start();
    const incremented = started.increment();

    expect(started.pullEvents().map(({ name }) => name)).toEqual(["counter.started"]);
    expect(incremented.pullEvents().map(({ name }) => name)).toEqual([
      "counter.started",
      "counter.incremented",
    ]);
  });

  it("la lista que entrega pullEvents es una copia: cambiarla no altera el agregado", () => {
    const counter = Counter.start();
    const pulled = counter.pullEvents();
    pulled.push(event("intruso"));

    expect(counter.pullEvents()).toEqual([]);
  });
});
