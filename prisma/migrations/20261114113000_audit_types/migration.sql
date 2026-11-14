-- AlterTable
ALTER TABLE "Engagement" ADD COLUMN     "auditType" TEXT;


-- existing engagements get a type: financial statement audits, then from the plan, then from the area
UPDATE "Engagement" SET "auditType" = 'statutory' WHERE "kind" = 'financial';
UPDATE "Engagement" e SET "auditType" = CASE p."kind" WHEN 'it' THEN 'it' WHEN 'compliance' THEN 'compliance' WHEN 'advisory' THEN 'advisory' WHEN 'followup' THEN 'followup' ELSE 'operational' END
  FROM "PlanItem" p WHERE p."engagementId" = e."id" AND e."auditType" IS NULL;
UPDATE "Engagement" SET "auditType" = CASE "area" WHEN 'Technology' THEN 'it' WHEN 'Compliance' THEN 'compliance' WHEN 'Governance' THEN 'governance' ELSE 'operational' END WHERE "auditType" IS NULL;
