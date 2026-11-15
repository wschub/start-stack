import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "../../use-cases/auth/ports/password-hasher.ts";

export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain);
  }

  async verify(storedHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(storedHash, plain);
    } catch {
      return false;
    }
  }
}
