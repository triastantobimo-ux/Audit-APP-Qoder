-- CreateTable
CREATE TABLE "AuditPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersedesId" TEXT,
    "changeReason" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "submittedAt" DATETIME,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuditPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditPlan_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditPlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditPlanEngagement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "riskAssessmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "engagementType" TEXT NOT NULL DEFAULT 'operational',
    "quarter" INTEGER,
    "plannedStart" DATETIME,
    "plannedEnd" DATETIME,
    "sourceRiskScore" REAL NOT NULL,
    "sourceRiskLevel" TEXT NOT NULL,
    "sourceRationale" TEXT,
    "overrideScore" REAL,
    "overrideReason" TEXT,
    "riskScore" REAL NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "estimatedHours" REAL NOT NULL,
    "actualHours" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuditPlanEngagement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AuditPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditPlanEngagement_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "AuditEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditPlanEngagement_riskAssessmentId_fkey" FOREIGN KEY ("riskAssessmentId") REFERENCES "RiskAssessment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditPlanAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "estimatedHours" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuditPlanAllocation_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditPlanEngagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditPlanCapacity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "availableHours" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuditPlanCapacity_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AuditPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AuditPlan_workspaceId_year_isCurrent_idx" ON "AuditPlan"("workspaceId", "year", "isCurrent");

-- CreateIndex
CREATE INDEX "AuditPlan_workspaceId_status_idx" ON "AuditPlan"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlan_workspaceId_year_version_key" ON "AuditPlan"("workspaceId", "year", "version");

-- CreateIndex
CREATE INDEX "AuditPlanEngagement_planId_status_quarter_idx" ON "AuditPlanEngagement"("planId", "status", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlanEngagement_planId_entityId_key" ON "AuditPlanEngagement"("planId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlanAllocation_engagementId_role_key" ON "AuditPlanAllocation"("engagementId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlanCapacity_planId_role_key" ON "AuditPlanCapacity"("planId", "role");
