import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../../../src/shared/domain/domain-event.ts";
import { InProcessEventBus, NULL_EVENT_BUS } from "../../../../src/shared/events/event-bus.ts";

const AT = new Date("2026-11-15T10:00:00Z");

interface OrderPlaced extends DomainEvent {
  readonly name: "order.placed";
  readonly orderId: string;
}

const placed = (orderId: string): OrderPlaced => ({
  name: "order.placed",
  occurredAt: AT,
  orderId,
});
const cancelled: DomainEvent = { name: "order.cancelled", occurredAt: AT };

describe("InProcessEventBus", () => {
  it("entrega cada evento a los manejadores suscritos a su nombre", async () => {
    const seen: string[] = [];
    const bus = new InProcessEventBus()
      .subscribe<OrderPlaced>("order.placed", async (event) => {
        seen.push(`placed:${event.orderId}`);
      })
      .subscribe("order.cancelled", async () => {
        seen.push("cancelled");
      });

    await bus.publish([placed("1"), cancelled, placed("2")]);

    expect(seen).toEqual(["placed:1", "cancelled", "placed:2"]);
  });

  it("ejecuta todos los manejadores de un evento, en el orden en que se suscribieron", async () => {
    const seen: string[] = [];
    const bus = new InProcessEventBus()
      .subscribe("order.placed", async () => {
        seen.push("primero");
      })
      .subscribe("order.placed", async () => {
        seen.push("segundo");
      });

    await bus.publish([placed("1")]);

    expect(seen).toEqual(["primero", "segundo"]);
  });

  it("espera a que un manejador termine antes de empezar el siguiente", async () => {
    const seen: string[] = [];
    const bus = new InProcessEventBus()
      .subscribe("order.placed", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen.push("lento");
      })
      .subscribe("order.placed", async () => {
        seen.push("rápido");
      });

    await bus.publish([placed("1")]);

    expect(seen).toEqual(["lento", "rápido"]);
  });

  it("ignora los eventos que no tienen manejadores y las publicaciones vacías", async () => {
    const bus = new InProcessEventBus();

    await expect(bus.publish([cancelled])).resolves.toBeUndefined();
    await expect(bus.publish([])).resolves.toBeUndefined();
  });

  it("si un manejador falla, el error llega a quien publica y no se sigue con los demás", async () => {
    const seen: string[] = [];
    const bus = new InProcessEventBus()
      .subscribe("order.placed", async () => {
        throw new Error("proveedor caído");
      })
      .subscribe("order.placed", async () => {
        seen.push("no debería ejecutarse");
      });

    await expect(bus.publish([placed("1"), placed("2")])).rejects.toThrow("proveedor caído");
    expect(seen).toEqual([]);
  });

  it("cada bus tiene sus propias suscripciones", async () => {
    const seen: string[] = [];
    new InProcessEventBus().subscribe("order.placed", async () => {
      seen.push("otro bus");
    });

    await new InProcessEventBus().publish([placed("1")]);

    expect(seen).toEqual([]);
  });
});

describe("NULL_EVENT_BUS", () => {
  it("acepta cualquier evento y no hace nada", async () => {
    await expect(NULL_EVENT_BUS.publish([placed("1"), cancelled])).resolves.toBeUndefined();
  });
});
