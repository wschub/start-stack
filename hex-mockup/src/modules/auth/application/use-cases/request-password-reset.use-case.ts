import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { UserRepository } from "../../../users/domain/repositories/user.repository.ts";
import type { PasswordResetMethod } from "../../domain/entities/password-reset.ts";
import type { PasswordResetRepository } from "../../domain/repositories/password-reset.repository.ts";
import {
  hashResetCode,
  hashResetToken,
  RESET_CODE_LENGTH,
} from "../../domain/services/password-reset-secret.ts";
import type { PasswordResetNotifier } from "../ports/password-reset-notifier.ts";

export interface RequestPasswordResetInput {
  email: string;
  method: PasswordResetMethod;
}

export interface RequestPasswordResetDeps {
  users: UserRepository;
  resets: PasswordResetRepository;
  notifier: PasswordResetNotifier;
  linkTtlSeconds: number;
  codeTtlSeconds: number;
  now?: () => Date;
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function generateCode(): string {
  return String(randomInt(0, 10 ** RESET_CODE_LENGTH)).padStart(RESET_CODE_LENGTH, "0");
}

export class RequestPasswordReset {
  private readonly users: UserRepository;
  private readonly resets: PasswordResetRepository;
  private readonly notifier: PasswordResetNotifier;
  private readonly linkTtlSeconds: number;
  private readonly codeTtlSeconds: number;
  private readonly now: () => Date;

  constructor(deps: RequestPasswordResetDeps) {
    this.users = deps.users;
    this.resets = deps.resets;
    this.notifier = deps.notifier;
    this.linkTtlSeconds = deps.linkTtlSeconds;
    this.codeTtlSeconds = deps.codeTtlSeconds;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * No devuelve nada ni falla si el correo no existe o la cuenta está inactiva: quien llama no
   * debe poder averiguar qué correos están registrados.
   */
  async execute(input: RequestPasswordResetInput): Promise<void> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !user.isActive()) return;

    const now = this.now();
    const id = randomUUID();
    const isLink = input.method === "link";
    const secret = isLink ? generateToken() : generateCode();
    const ttlSeconds = isLink ? this.linkTtlSeconds : this.codeTtlSeconds;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    await this.resets.replaceForUser({
      id,
      userPublicId: user.publicId,
      method: input.method,
      secretHash: isLink ? hashResetToken(secret) : hashResetCode(id, secret),
      expiresAt,
      usedAt: null,
      attempts: 0,
      createdAt: now,
    });
    await this.notifier.notify({
      email: user.email,
      firstName: user.firstName,
      locale: user.locale,
      method: input.method,
      secret,
      expiresAt,
    });
  }
}
