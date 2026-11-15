import type { SessionTokens } from "../../use-cases/auth/issue-session.use-case.ts";

export interface SessionJson {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

/** El refresh token no aparece aquí a propósito: solo viaja en su cookie HttpOnly. */
export function presentSession(session: SessionTokens): SessionJson {
  return {
    accessToken: session.accessToken,
    tokenType: "Bearer",
    expiresIn: session.accessTokenExpiresIn,
  };
}
