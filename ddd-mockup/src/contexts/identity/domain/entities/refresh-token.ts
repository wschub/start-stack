export interface RefreshToken {
  readonly tokenHash: string;
  readonly familyId: string;
  readonly userPublicId: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}
