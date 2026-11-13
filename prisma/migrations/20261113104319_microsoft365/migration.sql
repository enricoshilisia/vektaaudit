-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "outlookEventId" TEXT;

-- AlterTable
ALTER TABLE "CommitteePack" ADD COLUMN     "spUrl" TEXT;

-- AlterTable
ALTER TABLE "CsaRequest" ADD COLUMN     "emailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "msConnectedAt" TIMESTAMP(3),
ADD COLUMN     "msConnectedBy" TEXT,
ADD COLUMN     "msMailbox" TEXT,
ADD COLUMN     "msTenantId" TEXT,
ADD COLUMN     "msTenantName" TEXT,
ADD COLUMN     "spFolder" TEXT NOT NULL DEFAULT 'VektaAudit',
ADD COLUMN     "spSiteUrl" TEXT,
ADD COLUMN     "teamsWebhook" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "msObjectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_msTenantId_key" ON "Organization"("msTenantId");

