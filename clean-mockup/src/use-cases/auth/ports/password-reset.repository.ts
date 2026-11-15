import type { PasswordReset } from "../../../entities/password-reset.ts";

export interface PasswordResetRepository {
  /** Guarda la solicitud y borra las anteriores del mismo usuario: solo hay una vigente. */
  replaceForUser(reset: PasswordReset): Promise<void>;
  findBySecretHash(secretHash: string): Promise<PasswordReset | null>;
  findForUser(userPublicId: string): Promise<PasswordReset | null>;
  /**
   * Suma un intento solo si la solicitud sigue sin usar, sin expirar y con intentos disponibles,
   * de forma atómica. Devuelve false si ya no se puede intentar.
   */
  registerAttempt(id: string, maxAttempts: number, now: Date): Promise<boolean>;
  /** Marca la solicitud como usada solo si no lo estaba, de forma atómica. */
  markUsed(id: string, at: Date): Promise<boolean>;
  /** Borra las solicitudes que expiraron estrictamente antes de la fecha dada y devuelve cuántas. */
  deleteExpired(before: Date): Promise<number>;
}
