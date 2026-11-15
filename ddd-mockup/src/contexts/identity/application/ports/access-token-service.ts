export interface AccessToken {
  token: string;
  expiresInSeconds: number;
}

export interface AccessTokenService {
  issue(subject: string): Promise<AccessToken>;
  verify(token: string): Promise<{ subject: string }>;
}
