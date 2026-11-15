import { createHash, timingSafeEqual } from "node:crypto";

export const RESET_CODE_LENGTH = 6;
export const MAX_RESET_CODE_ATTEMPTS = 5;

/** El token del enlace es aleatorio y de alta entropía: un SHA-256 sin sal es suficiente. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * El código es corto, así que su hash se liga al id de la solicitud: dos solicitudes con el mismo
 * código no comparten hash. La defensa real contra la fuerza bruta es el límite de intentos.
 */
export function hashResetCode(resetId: string, code: string): string {
  return createHash("sha256").update(`${resetId}:${code}`).digest("hex");
}

export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
