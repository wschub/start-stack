import type { RefreshToken } from "../entities/refresh-token.ts";

export interface RefreshTokenRepository {
  add(token: RefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  /**
   * Marca el token como usado solo si sigue sin usar ni revocar, de forma atómica.
   * Devuelve false si otro uso se adelantó.
   */
  markUsed(tokenHash: string, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  /** Revoca todas las sesiones abiertas de un usuario. */
  revokeAllForUser(userPublicId: string, at: Date): Promise<void>;
  /** Borra los tokens que expiraron estrictamente antes de la fecha dada y devuelve cuántos. */
  deleteExpired(before: Date): Promise<number>;
}
