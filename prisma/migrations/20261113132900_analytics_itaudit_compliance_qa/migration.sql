-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autoReminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remindersRanAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DataSet" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "engagementId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "columns" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRow" (
    "id" TEXT NOT NULL,
    "dataSetId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "cells" JSONB NOT NULL,

    CONSTRAINT "DataRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticRun" (
    "id" TEXT NOT NULL,
    "dataSetId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "tested" INTEGER NOT NULL,
    "hits" INTEGER NOT NULL,
    "summary" JSONB,
    "ranBy" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticException" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rowIdx" INTEGER NOT NULL,
    "detail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "findingId" TEXT,

    CONSTRAINT "AnalyticException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItSystem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerName" TEXT,
    "ownerEmail" TEXT,
    "critical" BOOLEAN NOT NULL DEFAULT true,
    "access" TEXT NOT NULL DEFAULT 'not_tested',
    "change" TEXT NOT NULL DEFAULT 'not_tested',
    "operations" TEXT NOT NULL DEFAULT 'not_tested',
    "development" TEXT NOT NULL DEFAULT 'not_applicable',
    "lastTestedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SodRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "roleA" TEXT NOT NULL,
    "roleB" TEXT NOT NULL,
    "risk" TEXT NOT NULL DEFAULT 'high',
    "description" TEXT,

    CONSTRAINT "SodRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessReview" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessList" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "token" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "AccessList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessEntry" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "person" TEXT,
    "roles" TEXT NOT NULL,
    "department" TEXT,
    "lastLogin" TEXT,
    "decision" TEXT,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedBy" TEXT,

    CONSTRAINT "AccessEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Framework" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "applicable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaReview" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "results" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "score" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QaReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conformance" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "ratings" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ControlToRequirement" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ControlToRequirement_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "DataSet_orgId_idx" ON "DataSet"("orgId");

-- CreateIndex
CREATE INDEX "DataRow_dataSetId_idx_idx" ON "DataRow"("dataSetId", "idx");

-- CreateIndex
CREATE INDEX "AnalyticRun_dataSetId_rule_idx" ON "AnalyticRun"("dataSetId", "rule");

-- CreateIndex
CREATE INDEX "AnalyticException_runId_idx" ON "AnalyticException"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessList_token_key" ON "AccessList"("token");

-- CreateIndex
CREATE INDEX "AccessEntry_listId_idx" ON "AccessEntry"("listId");

-- CreateIndex
CREATE INDEX "Requirement_frameworkId_sort_idx" ON "Requirement"("frameworkId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "Conformance_orgId_year_key" ON "Conformance"("orgId", "year");

-- CreateIndex
CREATE INDEX "_ControlToRequirement_B_index" ON "_ControlToRequirement"("B");

-- AddForeignKey
ALTER TABLE "DataSet" ADD CONSTRAINT "DataSet_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSet" ADD CONSTRAINT "DataSet_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRow" ADD CONSTRAINT "DataRow_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticRun" ADD CONSTRAINT "AnalyticRun_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticException" ADD CONSTRAINT "AnalyticException_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalyticRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItSystem" ADD CONSTRAINT "ItSystem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SodRule" ADD CONSTRAINT "SodRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SodRule" ADD CONSTRAINT "SodRule_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "ItSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessList" ADD CONSTRAINT "AccessList_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AccessReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessList" ADD CONSTRAINT "AccessList_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "ItSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEntry" ADD CONSTRAINT "AccessEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "AccessList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Framework" ADD CONSTRAINT "Framework_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaReview" ADD CONSTRAINT "QaReview_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaReview" ADD CONSTRAINT "QaReview_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaReview" ADD CONSTRAINT "QaReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conformance" ADD CONSTRAINT "Conformance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ControlToRequirement" ADD CONSTRAINT "_ControlToRequirement_A_fkey" FOREIGN KEY ("A") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ControlToRequirement" ADD CONSTRAINT "_ControlToRequirement_B_fkey" FOREIGN KEY ("B") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

