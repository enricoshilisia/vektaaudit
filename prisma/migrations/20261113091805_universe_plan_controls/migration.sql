-- CreateTable
CREATE TABLE "AuditableEntity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "owner" TEXT,
    "impact" INTEGER NOT NULL DEFAULT 3,
    "likelihood" INTEGER NOT NULL DEFAULT 3,
    "controlEnv" TEXT NOT NULL DEFAULT 'adequate',
    "cycleMonths" INTEGER NOT NULL DEFAULT 24,
    "lastAuditedAt" TIMESTAMP(3),
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditableEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPlan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "capacityHours" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "entityId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'assurance',
    "leadId" TEXT,
    "hours" INTEGER NOT NULL DEFAULT 0,
    "startMonth" INTEGER NOT NULL DEFAULT 1,
    "endMonth" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "note" TEXT,
    "engagementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "process" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "rating" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Control" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "process" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "type" TEXT NOT NULL DEFAULT 'preventive',
    "nature" TEXT NOT NULL DEFAULT 'manual',
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "key" BOOLEAN NOT NULL DEFAULT true,
    "ownerName" TEXT,
    "assertion" TEXT,
    "component" TEXT,
    "design" TEXT NOT NULL DEFAULT 'not_assessed',
    "operating" TEXT NOT NULL DEFAULT 'not_tested',
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "testType" TEXT NOT NULL DEFAULT 'operating',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "population" INTEGER,
    "populationValue" BIGINT,
    "populationSource" TEXT,
    "method" TEXT NOT NULL DEFAULT 'random',
    "confidence" INTEGER NOT NULL DEFAULT 90,
    "tolerableRate" INTEGER NOT NULL DEFAULT 5,
    "attributes" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "result" TEXT,
    "conclusion" TEXT,
    "preparedById" TEXT,
    "preparedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestSample" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "ref" TEXT NOT NULL,
    "description" TEXT,
    "amount" BIGINT,
    "results" JSONB NOT NULL DEFAULT '{}',
    "comment" TEXT,

    CONSTRAINT "TestSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ControlToRisk" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ControlToRisk_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "AuditableEntity_orgId_idx" ON "AuditableEntity"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditableEntity_orgId_code_key" ON "AuditableEntity"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlan_orgId_year_key" ON "AuditPlan"("orgId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "PlanItem_engagementId_key" ON "PlanItem"("engagementId");

-- CreateIndex
CREATE INDEX "PlanItem_planId_startMonth_idx" ON "PlanItem"("planId", "startMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Risk_orgId_code_key" ON "Risk"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Control_orgId_code_key" ON "Control"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ControlTest_engagementId_ref_key" ON "ControlTest"("engagementId", "ref");

-- CreateIndex
CREATE INDEX "TestSample_testId_idx_idx" ON "TestSample"("testId", "idx");

-- CreateIndex
CREATE INDEX "_ControlToRisk_B_index" ON "_ControlToRisk"("B");

-- AddForeignKey
ALTER TABLE "AuditableEntity" ADD CONSTRAINT "AuditableEntity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditableEntity" ADD CONSTRAINT "AuditableEntity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPlan" ADD CONSTRAINT "AuditPlan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AuditPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "AuditableEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Control" ADD CONSTRAINT "Control_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTest" ADD CONSTRAINT "ControlTest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTest" ADD CONSTRAINT "ControlTest_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTest" ADD CONSTRAINT "ControlTest_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTest" ADD CONSTRAINT "ControlTest_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTest" ADD CONSTRAINT "ControlTest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSample" ADD CONSTRAINT "TestSample_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ControlTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ControlToRisk" ADD CONSTRAINT "_ControlToRisk_A_fkey" FOREIGN KEY ("A") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ControlToRisk" ADD CONSTRAINT "_ControlToRisk_B_fkey" FOREIGN KEY ("B") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
