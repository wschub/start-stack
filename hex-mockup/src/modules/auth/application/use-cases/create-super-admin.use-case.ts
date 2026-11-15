import { AppError } from "../../../../shared/errors/app-error.ts";
import { type PublicUser, toPublicUser } from "../../../users/application/public-user.ts";
import { User } from "../../../users/domain/entities/user.entity.ts";
import type { UserRepository } from "../../../users/domain/repositories/user.repository.ts";
import { SUPER_ADMIN_ROLE } from "../../domain/entities/role.ts";
import type { RoleRepository } from "../../domain/repositories/role.repository.ts";
import { assertPasswordPolicy } from "../../domain/services/password-policy.ts";
import type { PasswordHasher } from "../ports/password-hasher.ts";

export interface CreateSuperAdminInput {
  email: string;
  /** Solo se usa si la cuenta no existe todavía. */
  password: string;
  firstName: string;
  lastName: string;
}

export interface CreateSuperAdminResult {
  user: PublicUser;
  /** true si se creó la cuenta; false si ya existía y solo se le concedió el rol. */
  created: boolean;
}

/**
 * Resuelve el arranque: sin un primer superadministrador nadie podría crear roles ni asignarlos.
 * No se expone por HTTP; se ejecuta desde la línea de comandos (`npm run admin:create`).
 */
export class CreateSuperAdmin {
  private readonly users: UserRepository;
  private readonly roles: RoleRepository;
  private readonly hasher: PasswordHasher;

  constructor(deps: { users: UserRepository; roles: RoleRepository; hasher: PasswordHasher }) {
    this.users = deps.users;
    this.roles = deps.roles;
    this.hasher = deps.hasher;
  }

  async execute(input: CreateSuperAdminInput): Promise<CreateSuperAdminResult> {
    const role = await this.roles.findByName(SUPER_ADMIN_ROLE);
    if (!role) throw new Error("The SUPER_ADMIN role does not exist: run the migrations first");

    const existing = await this.users.findByEmail(input.email);
    if (existing && !existing.isActive()) {
      throw new AppError("forbidden", { code: "ACCOUNT_INACTIVE" });
    }
    const user = existing ?? (await this.createUser(input));

    // Se conservan los roles que ya tuviera y la contraseña de una cuenta existente no se toca.
    const current = await this.roles.findByUser(user.publicId);
    const roleIds = new Set([...current.map((item) => item.publicId), role.publicId]);
    await this.roles.setUserRoles(user.publicId, [...roleIds]);

    return { user: toPublicUser(user), created: !existing };
  }

  private async createUser(input: CreateSuperAdminInput): Promise<User> {
    assertPasswordPolicy(input.password);
    const user = User.create({
      email: input.email,
      passwordHash: await this.hasher.hash(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
    });
    await this.users.add(user);
    return user;
  }
}
