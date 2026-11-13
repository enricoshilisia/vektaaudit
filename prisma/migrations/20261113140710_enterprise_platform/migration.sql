-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "country" TEXT,
ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "Engagement" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "legalHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalHoldNote" TEXT,
ADD COLUMN     "unlockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "engagementIds" JSONB,
ADD COLUMN     "guestUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "lockAfterDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "requireMfa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retentionYears" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "guestUntil" TIMESTAMP(3),
ADD COLUMN     "recoveryCodes" JSONB,
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "GuestAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestAccess_userId_engagementId_key" ON "GuestAccess"("userId", "engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hash_key" ON "ApiKey"("hash");

-- AddForeignKey
ALTER TABLE "GuestAccess" ADD CONSTRAINT "GuestAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAccess" ADD CONSTRAINT "GuestAccess_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

