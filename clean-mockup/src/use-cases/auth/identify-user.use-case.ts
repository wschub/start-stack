import { AppError } from "../../entities/errors/app-error.ts";
import type { UseCase } from "../use-case.ts";
import type { UserRepository } from "../users/ports/user.repository.ts";
import { type PublicUser, toPublicUser } from "../users/public-user.ts";
import type { AccessTokenService } from "./ports/access-token-service.ts";

/**
 * Averigua quién hace la petición a partir de su access token. El usuario se lee en cada
 * petición: una cuenta borrada o desactivada deja de entrar aunque su token siga vigente.
 */
export class IdentifyUser implements UseCase<string, PublicUser> {
  private readonly accessTokens: AccessTokenService;
  private readonly users: UserRepository;

  constructor(deps: { accessTokens: AccessTokenService; users: UserRepository }) {
    this.accessTokens = deps.accessTokens;
    this.users = deps.users;
  }

  async execute(accessToken: string): Promise<PublicUser> {
    const { subject } = await this.accessTokens.verify(accessToken);
    const user = await this.users.findByPublicId(subject);
    if (!user) throw new AppError("unauthenticated", { code: "INVALID_TOKEN" });
    if (!user.isActive()) throw new AppError("forbidden", { code: "ACCOUNT_INACTIVE" });
    return toPublicUser(user);
  }
}
