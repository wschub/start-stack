/**
 * Regla externa que puede vetar un cambio de estado. El módulo users no sabe de roles: quien
 * los gestiona (auth) implementa este puerto para proteger a los superadministradores.
 */
export interface UserStatusGuard {
  /** Lanza un AppError si `actorPublicId` no puede activar o desactivar a `targetPublicId`. */
  assertCanChangeStatus(actorPublicId: string, targetPublicId: string): Promise<void>;
}
