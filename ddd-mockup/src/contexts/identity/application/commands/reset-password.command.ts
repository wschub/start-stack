import { AppError } from "../../../../shared/errors/app-error.ts";
import type { PasswordResetRequest } from "../../domain/aggregates/password-reset-request.ts";
import type { PasswordResetRepository } from "../../domain/repositories/password-reset.repository.ts";
import type { UserRepository } from "../../domain/repositories/user.repository.ts";
import { assertPasswordPolicy } from "../../domain/services/password-policy.ts";
import {
  hashResetToken,
  MAX_RESET_CODE_ATTEMPTS,
} from "../../domain/services/password-reset-secret.ts";
import type { PasswordHasher } from "../ports/password-hasher.ts";

export type ResetPasswordInput =
  | { method: "link"; token: string; password: string }
  | { method: "code"; email: string; code: string; password: string };

export interface ResetPasswordDeps {
  users: UserRepository;
  resets: PasswordResetRepository;
  hasher: PasswordHasher;
  now?: () => Date;
}

const invalidToken = () => new AppError("validation", { code: "INVALID_RESET_TOKEN" });
const invalidCode = () => new AppError("validation", { code: "INVALID_RESET_CODE" });

export class ResetPassword {
  private readonly users: UserRepository;
  private readonly resets: PasswordResetRepository;
  private readonly hasher: PasswordHasher;
  private readonly now: () => Date;

  constructor(deps: ResetPasswordDeps) {
    this.users = deps.users;
    this.resets = deps.resets;
    this.hasher = deps.hasher;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Cerrar las sesiones abiertas del usuario no es tarea de este comando: `User.changePassword`
   * anota el evento `user.password_changed` y su manejador las revoca.
   */
  async execute(input: ResetPasswordInput): Promise<void> {
    // Antes que nada: una contraseña débil no debe gastar el token ni un intento del código.
    assertPasswordPolicy(input.password);

    const now = this.now();
    const invalid = input.method === "link" ? invalidToken : invalidCode;
    const request =
      input.method === "link"
        ? await this.findByToken(input.token, now)
        : await this.findByCode(input.email, input.code, now);

    const user = await this.users.findByPublicId(request.userPublicId);
    if (!user || !user.isActive()) throw invalid();

    const consumed = await this.resets.markUsed(request.id, now);
    if (!consumed) throw invalid();

    const passwordHash = await this.hasher.hash(input.password);
    await this.users.update(user.changePassword(passwordHash, () => now));
  }

  private async findByToken(token: string, now: Date): Promise<PasswordResetRequest> {
    const request = await this.resets.findBySecretHash(hashResetToken(token));
    if (!request || !request.isUsableWith("link", now)) throw invalidToken();
    return request;
  }

  private async findByCode(email: string, code: string, now: Date): Promise<PasswordResetRequest> {
    const user = await this.users.findByEmail(email);
    const request = user ? await this.resets.findForUser(user.publicId) : null;
    if (!request || request.method !== "code") throw invalidCode();

    // El intento se cuenta antes de comparar: así dos peticiones simultáneas no pueden probar
    // más códigos de los permitidos.
    const allowed = await this.resets.registerAttempt(request.id, MAX_RESET_CODE_ATTEMPTS, now);
    if (!allowed) throw invalidCode();
    if (!request.matchesCode(code)) throw invalidCode();
    return request;
  }
}
