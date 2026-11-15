import { createHash } from "node:crypto";

/** Los refresh tokens son aleatorios y de alta entropía: un SHA-256 sin sal es suficiente. */
export function hashRefreshToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}
