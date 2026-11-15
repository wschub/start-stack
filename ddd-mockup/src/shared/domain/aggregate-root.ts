import type { DomainEvent } from "./domain-event.ts";

/**
 * Raíz de agregado: la única puerta de entrada para cambiar un conjunto de objetos que deben
 * mantenerse coherentes. Además de proteger sus invariantes, anota los eventos de dominio que
 * producen sus cambios; el repositorio los publica cuando el agregado se guarda.
 *
 * Los agregados de esta base son inmutables: cada cambio devuelve una instancia nueva, que
 * hereda los eventos pendientes de la anterior.
 */
export abstract class AggregateRoot {
  private readonly pendingEvents: DomainEvent[];

  protected constructor(pendingEvents: readonly DomainEvent[] = []) {
    this.pendingEvents = [...pendingEvents];
  }

  /** Eventos pendientes de publicar, sin vaciarlos. */
  protected get events(): readonly DomainEvent[] {
    return this.pendingEvents;
  }

  /** Devuelve los eventos pendientes y los vacía. Lo llama el repositorio al guardar. */
  pullEvents(): DomainEvent[] {
    return this.pendingEvents.splice(0);
  }
}
