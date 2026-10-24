-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "engagementType" TEXT NOT NULL DEFAULT 'operational',
    "templateKey" TEXT,
    "objective" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "entityId" TEXT NOT NULL,
    "riskAssessmentId" TEXT,
    "planEngagementId" TEXT,
    "adHocReason" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "budgetHours" REAL NOT NULL,
    "preparerId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "issuedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Engagement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Engagement_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "AuditEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Engagement_riskAssessmentId_fkey" FOREIGN KEY ("riskAssessmentId") REFERENCES "RiskAssessment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Engagement_planEngagementId_fkey" FOREIGN KEY ("planEngagementId") REFERENCES "AuditPlanEngagement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Engagement_preparerId_fkey" FOREIGN KEY ("preparerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Engagement_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Engagement_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngagementRcmRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "riskDescription" TEXT NOT NULL,
    "controlDescription" TEXT NOT NULL,
    "assertion" TEXT NOT NULL,
    "procedureDescription" TEXT NOT NULL,
    "evidenceRequirement" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EngagementRcmRow_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngagementTransition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngagementTransition_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EngagementTransition_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_planEngagementId_key" ON "Engagement"("planEngagementId");

-- CreateIndex
CREATE INDEX "Engagement_workspaceId_status_idx" ON "Engagement"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Engagement_workspaceId_entityId_idx" ON "Engagement"("workspaceId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_workspaceId_code_key" ON "Engagement"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "EngagementRcmRow_engagementId_sortOrder_idx" ON "EngagementRcmRow"("engagementId", "sortOrder");

-- CreateIndex
CREATE INDEX "EngagementTransition_engagementId_createdAt_idx" ON "EngagementTransition"("engagementId", "createdAt");
