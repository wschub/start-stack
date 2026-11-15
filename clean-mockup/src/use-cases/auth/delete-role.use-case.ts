import type { UseCase } from "../use-case.ts";
import { AppError } from "../../entities/errors/app-error.ts";
import type { RoleRepository } from "./ports/role.repository.ts";

/** Borra un rol y lo retira de quienes lo tenían. Los roles de sistema no se borran. */
export class DeleteRole implements UseCase<string, void> {
  private readonly roles: RoleRepository;

  constructor(deps: { roles: RoleRepository }) {
    this.roles = deps.roles;
  }

  async execute(publicId: string): Promise<void> {
    const role = await this.roles.findByPublicId(publicId);
    if (!role) throw new AppError("not_found", { code: "ROLE_NOT_FOUND" });
    role.assertEditable();
    await this.roles.remove(role.publicId);
  }
}
