import type { UseCase } from "../use-case.ts";
import { AppError } from "../../entities/errors/app-error.ts";
import type { UserRepository } from "../users/ports/user.repository.ts";
import type { PasswordReset } from "../../entities/password-reset.ts";
import type { PasswordResetRepository } from "./ports/password-reset.repository.ts";
import type { RefreshTokenRepository } from "./ports/refresh-token.repository.ts";
import { assertPasswordPolicy } from "../../entities/rules/password-policy.ts";
import {
  hashResetCode,
  hashResetToken,
  MAX_RESET_CODE_ATTEMPTS,
  sameHash,
} from "../../entities/rules/password-reset-secret.ts";
import type { PasswordHasher } from "./ports/password-hasher.ts";

export type ResetPasswordInput =
  | { method: "link"; token: string; password: string }
  | { method: "code"; email: string; code: string; password: string };

export interface ResetPasswordDeps {
  users: UserRepository;
  resets: PasswordResetRepository;
  refreshTokens: RefreshTokenRepository;
  hasher: PasswordHasher;
  now?: () => Date;
}

const invalidToken = () => new AppError("validation", { code: "INVALID_RESET_TOKEN" });
const invalidCode = () => new AppError("validation", { code: "INVALID_RESET_CODE" });

export class ResetPassword implements UseCase<ResetPasswordInput, void> {
  private readonly users: UserRepository;
  private readonly resets: PasswordResetRepository;
  private readonly refreshTokens: RefreshTokenRepository;
  private readonly hasher: PasswordHasher;
  private readonly now: () => Date;

  constructor(deps: ResetPasswordDeps) {
    this.users = deps.users;
    this.resets = deps.resets;
    this.refreshTokens = deps.refreshTokens;
    this.hasher = deps.hasher;
    this.now = deps.now ?? (() => new Date());
  }

  async execute(input: ResetPasswordInput): Promise<void> {
    // Antes que nada: una contraseña débil no debe gastar el token ni un intento del código.
    assertPasswordPolicy(input.password);

    const now = this.now();
    const invalid = input.method === "link" ? invalidToken : invalidCode;
    const reset =
      input.method === "link"
        ? await this.findByToken(input.token, now)
        : await this.findByCode(input.email, input.code, now);

    const user = await this.users.findByPublicId(reset.userPublicId);
    if (!user || !user.isActive()) throw invalid();

    const consumed = await this.resets.markUsed(reset.id, now);
    if (!consumed) throw invalid();

    const passwordHash = await this.hasher.hash(input.password);
    await this.users.update(user.changePassword(passwordHash, () => now));
    // Quien recupera la cuenta puede haberla perdido: se cierran todas sus sesiones abiertas.
    await this.refreshTokens.revokeAllForUser(user.publicId, now);
  }

  private async findByToken(token: string, now: Date): Promise<PasswordReset> {
    const reset = await this.resets.findBySecretHash(hashResetToken(token));
    if (!reset || reset.method !== "link" || reset.usedAt) throw invalidToken();
    if (reset.expiresAt.getTime() <= now.getTime()) throw invalidToken();
    return reset;
  }

  private async findByCode(email: string, code: string, now: Date): Promise<PasswordReset> {
    const user = await this.users.findByEmail(email);
    const reset = user ? await this.resets.findForUser(user.publicId) : null;
    if (!reset || reset.method !== "code") throw invalidCode();

    // El intento se cuenta antes de comparar: así dos peticiones simultáneas no pueden probar
    // más códigos de los permitidos.
    const allowed = await this.resets.registerAttempt(reset.id, MAX_RESET_CODE_ATTEMPTS, now);
    if (!allowed) throw invalidCode();
    if (!sameHash(reset.secretHash, hashResetCode(reset.id, code))) throw invalidCode();
    return reset;
  }
}
