import { randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  type PasswordResetMethod,
  PasswordResetRequest,
} from "../../domain/aggregates/password-reset-request.ts";
import type { PasswordResetRepository } from "../../domain/repositories/password-reset.repository.ts";
import type { UserRepository } from "../../domain/repositories/user.repository.ts";
import { RESET_CODE_LENGTH } from "../../domain/services/password-reset-secret.ts";

export interface RequestPasswordResetInput {
  email: string;
  method: PasswordResetMethod;
}

export interface RequestPasswordResetDeps {
  users: UserRepository;
  resets: PasswordResetRepository;
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
  private readonly linkTtlSeconds: number;
  private readonly codeTtlSeconds: number;
  private readonly now: () => Date;

  constructor(deps: RequestPasswordResetDeps) {
    this.users = deps.users;
    this.resets = deps.resets;
    this.linkTtlSeconds = deps.linkTtlSeconds;
    this.codeTtlSeconds = deps.codeTtlSeconds;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * No devuelve nada ni falla si el correo no existe o la cuenta está inactiva: quien llama no
   * debe poder averiguar qué correos están registrados.
   *
   * Este comando no envía nada: al guardar la solicitud se publica el evento
   * `password_reset.requested`, y es su manejador quien hace llegar el enlace o el código.
   */
  async execute(input: RequestPasswordResetInput): Promise<void> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !user.isActive()) return;

    const isLink = input.method === "link";
    const request = PasswordResetRequest.issue({
      id: randomUUID(),
      user,
      method: input.method,
      secret: isLink ? generateToken() : generateCode(),
      ttlSeconds: isLink ? this.linkTtlSeconds : this.codeTtlSeconds,
      now: this.now(),
    });
    await this.resets.replaceForUser(request);
  }
}
