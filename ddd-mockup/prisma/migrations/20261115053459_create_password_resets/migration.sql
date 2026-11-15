-- CreateEnum
CREATE TYPE "PasswordResetMethod" AS ENUM ('LINK', 'CODE');

-- CreateTable
CREATE TABLE "password_resets" (
    "id" SERIAL NOT NULL,
    "publicId" UUID NOT NULL,
    "method" "PasswordResetMethod" NOT NULL,
    "secretHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_publicId_key" ON "password_resets"("publicId");

-- CreateIndex
CREATE INDEX "password_resets_secretHash_idx" ON "password_resets"("secretHash");

-- CreateIndex
CREATE INDEX "password_resets_userId_idx" ON "password_resets"("userId");

-- CreateIndex
CREATE INDEX "password_resets_expiresAt_idx" ON "password_resets"("expiresAt");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
