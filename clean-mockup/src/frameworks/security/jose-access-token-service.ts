import { errors, jwtVerify, SignJWT } from "jose";
import { AppError } from "../../entities/errors/app-error.ts";
import type {
  AccessToken,
  AccessTokenService,
} from "../../use-cases/auth/ports/access-token-service.ts";

export interface JoseAccessTokenOptions {
  secret: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
  now?: () => Date;
}

const MIN_SECRET_BYTES = 32;

export class JoseAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly ttlSeconds: number;
  private readonly now: () => Date;

  constructor(options: JoseAccessTokenOptions) {
    const key = new TextEncoder().encode(options.secret);
    if (key.byteLength < MIN_SECRET_BYTES) {
      throw new Error(`JWT secret must be at least ${MIN_SECRET_BYTES} bytes long`);
    }
    this.key = key;
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.ttlSeconds = options.ttlSeconds;
    this.now = options.now ?? (() => new Date());
  }

  async issue(subject: string): Promise<AccessToken> {
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(subject)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.ttlSeconds)
      .sign(this.key);
    return { token, expiresInSeconds: this.ttlSeconds };
  }

  async verify(token: string): Promise<{ subject: string }> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: this.issuer,
        audience: this.audience,
        currentDate: this.now(),
      });
      if (!payload.sub) throw new Error("token without subject");
      return { subject: payload.sub };
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw new AppError("unauthenticated", { code: "TOKEN_EXPIRED", cause: error });
      }
      throw new AppError("unauthenticated", { code: "INVALID_TOKEN", cause: error });
    }
  }
}
