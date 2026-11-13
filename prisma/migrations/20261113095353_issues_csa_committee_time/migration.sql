-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "csaItemId" TEXT;

-- AlterTable
ALTER TABLE "Engagement" ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "rating" TEXT;

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "dueChanges" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "originalDue" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "esc1Days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "esc1To" TEXT NOT NULL DEFAULT 'Head of the business unit',
ADD COLUMN     "esc2Days" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "esc2To" TEXT NOT NULL DEFAULT 'Chief Financial Officer',
ADD COLUMN     "esc3Days" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "esc3To" TEXT NOT NULL DEFAULT 'Audit committee';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "certifications" TEXT,
ADD COLUMN     "weeklyHours" INTEGER NOT NULL DEFAULT 40;

-- CreateTable
CREATE TABLE "CsaCampaign" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "period" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsaRequest" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "token" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsaRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsaItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "answer" TEXT,
    "comment" TEXT,
    "respondedAt" TIMESTAMP(3),
    "validation" TEXT,
    "validationNote" TEXT,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),

    CONSTRAINT "CsaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteePack" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "snapshot" JSONB,
    "issuedAt" TIMESTAMP(3),
    "issuedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitteePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "engagementId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'audit',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "engagementId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'audit',
    "label" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CsaRequest_token_key" ON "CsaRequest"("token");

-- CreateIndex
CREATE UNIQUE INDEX "CsaItem_requestId_controlId_key" ON "CsaItem"("requestId", "controlId");

-- CreateIndex
CREATE INDEX "TimeEntry_orgId_date_idx" ON "TimeEntry"("orgId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_date_idx" ON "TimeEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "Assignment_orgId_start_idx" ON "Assignment"("orgId", "start");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_csaItemId_fkey" FOREIGN KEY ("csaItemId") REFERENCES "CsaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsaCampaign" ADD CONSTRAINT "CsaCampaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsaRequest" ADD CONSTRAINT "CsaRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CsaCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsaItem" ADD CONSTRAINT "CsaItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CsaRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsaItem" ADD CONSTRAINT "CsaItem_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteePack" ADD CONSTRAINT "CommitteePack_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
