/**
 * Algo relevante para el negocio que ya ocurrió. Los eventos se nombran en pasado
 * ("user.registered") y solo llevan datos, nunca comportamiento.
 */
export interface DomainEvent {
  /** Nombre estable del evento, con la forma "agregado.hecho". */
  readonly name: string;
  readonly occurredAt: Date;
}
