/** "link": token largo que viaja en un enlace. "code": código corto que el usuario escribe. */
export type PasswordResetMethod = "link" | "code";

export interface PasswordReset {
  readonly id: string;
  readonly userPublicId: string;
  readonly method: PasswordResetMethod;
  /** Hash del token o del código; el valor en claro solo lo conoce quien recibe la notificación. */
  readonly secretHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  /** Intentos de canje registrados; limita la fuerza bruta sobre los códigos cortos. */
  readonly attempts: number;
  readonly createdAt: Date;
}
