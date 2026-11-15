import { AppError } from "../../../../shared/errors/app-error.ts";
import type { UserStatusGuard } from "../ports/user-status-guard.ts";
import type { GetUserAccess } from "../queries/get-user-access.query.ts";

/**
 * Solo un superadministrador puede activar o desactivar a otro. Como además nadie puede
 * desactivarse a sí mismo, siempre queda al menos un superadministrador activo.
 */
export class ProtectSuperAdmins implements UserStatusGuard {
  private readonly getUserAccess: GetUserAccess;

  constructor(deps: { getUserAccess: GetUserAccess }) {
    this.getUserAccess = deps.getUserAccess;
  }

  async assertCanChangeStatus(actorPublicId: string, targetPublicId: string): Promise<void> {
    const target = await this.getUserAccess.execute(targetPublicId);
    if (!target.isSuperAdmin) return;

    const actor = await this.getUserAccess.execute(actorPublicId);
    if (!actor.isSuperAdmin) throw new AppError("forbidden", { code: "SUPER_ADMIN_REQUIRED" });
  }
}
