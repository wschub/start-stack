import { AggregateRoot } from "../../../../shared/domain/aggregate-root.ts";
import type { DomainEvent } from "../../../../shared/domain/domain-event.ts";
import type { Locale } from "../../../../shared/i18n/locale.ts";
import type { PasswordResetRequested } from "../events/password-reset-requested.ts";
import { hashResetCode, hashResetToken, sameHash } from "../services/password-reset-secret.ts";

/** "link": token largo que viaja en un enlace. "code": código corto que el usuario escribe. */
export type PasswordResetMethod = "link" | "code";

export interface PasswordResetRequestProps {
  id: string;
  userPublicId: string;
  method: PasswordResetMethod;
  /** Hash del token o del código; el valor en claro solo viaja en el evento de dominio. */
  secretHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  /** Intentos de canje registrados; limita la fuerza bruta sobre los códigos cortos. */
  attempts: number;
  createdAt: Date;
}

export interface IssuePasswordResetInput {
  id: string;
  user: { publicId: string; email: string; firstName: string; locale: Locale };
  method: PasswordResetMethod;
  /** Token o código en claro, recién generado. */
  secret: string;
  ttlSeconds: number;
  now: Date;
}

/**
 * Agregado PasswordResetRequest: una solicitud de recuperación de contraseña. Al emitirse anota
 * el evento `password_reset.requested`, que es lo que dispara el envío del enlace o del código.
 */
export class PasswordResetRequest extends AggregateRoot {
  readonly id: string;
  readonly userPublicId: string;
  readonly method: PasswordResetMethod;
  readonly secretHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly attempts: number;
  readonly createdAt: Date;

  private constructor(props: PasswordResetRequestProps, events: readonly DomainEvent[] = []) {
    super(events);
    this.id = props.id;
    this.userPublicId = props.userPublicId;
    this.method = props.method;
    this.secretHash = props.secretHash;
    this.expiresAt = props.expiresAt;
    this.usedAt = props.usedAt;
    this.attempts = props.attempts;
    this.createdAt = props.createdAt;
    Object.freeze(this);
  }

  static issue(input: IssuePasswordResetInput): PasswordResetRequest {
    const expiresAt = new Date(input.now.getTime() + input.ttlSeconds * 1000);
    const requested: PasswordResetRequested = {
      name: "password_reset.requested",
      occurredAt: input.now,
      userId: input.user.publicId,
      email: input.user.email,
      firstName: input.user.firstName,
      locale: input.user.locale,
      method: input.method,
      secret: input.secret,
      expiresAt,
    };
    return new PasswordResetRequest(
      {
        id: input.id,
        userPublicId: input.user.publicId,
        method: input.method,
        secretHash:
          input.method === "link"
            ? hashResetToken(input.secret)
            : hashResetCode(input.id, input.secret),
        expiresAt,
        usedAt: null,
        attempts: 0,
        createdAt: input.now,
      },
      [requested],
    );
  }

  static restore(props: PasswordResetRequestProps): PasswordResetRequest {
    return new PasswordResetRequest(props);
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  /** ¿Sirve todavía para cambiar la contraseña con el método indicado? */
  isUsableWith(method: PasswordResetMethod, now: Date): boolean {
    return this.method === method && this.usedAt === null && !this.isExpired(now);
  }

  matchesCode(code: string): boolean {
    return this.method === "code" && sameHash(this.secretHash, hashResetCode(this.id, code));
  }

  toProps(): PasswordResetRequestProps {
    return {
      id: this.id,
      userPublicId: this.userPublicId,
      method: this.method,
      secretHash: this.secretHash,
      expiresAt: this.expiresAt,
      usedAt: this.usedAt,
      attempts: this.attempts,
      createdAt: this.createdAt,
    };
  }
}
