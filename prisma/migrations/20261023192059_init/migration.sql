-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "ownerUserId" TEXT,
    "description" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "AuditEntity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditEntity_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AuditEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditEntity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scaleMin" INTEGER NOT NULL DEFAULT 1,
    "scaleMax" INTEGER NOT NULL DEFAULT 5,
    "controlReductionMax" REAL NOT NULL DEFAULT 0.5,
    "levelThresholds" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "methodologyVersion" TEXT NOT NULL DEFAULT 'v1',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "retiredAt" DATETIME,
    CONSTRAINT "RiskModel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskFactor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "riskModelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" REAL NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RiskFactor_riskModelId_fkey" FOREIGN KEY ("riskModelId") REFERENCES "RiskModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "activatedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiskCycle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "riskModelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "inherentScore" REAL,
    "controlEffectivenessScore" REAL,
    "residualScore" REAL,
    "riskLevel" TEXT,
    "rationale" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersedesId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" DATETIME,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "assessedById" TEXT,
    "assessedAt" DATETIME,
    "calculatedAt" DATETIME,
    "calculationVersion" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiskAssessment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiskAssessment_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "AuditEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RiskAssessment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "RiskCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RiskAssessment_riskModelId_fkey" FOREIGN KEY ("riskModelId") REFERENCES "RiskModel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RiskAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RiskAssessment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskFactorScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "riskFactorId" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "rationale" TEXT,
    "evidenceNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiskFactorScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "RiskAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiskFactorScore_riskFactorId_fkey" FOREIGN KEY ("riskFactorId") REFERENCES "RiskFactor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskAssessmentReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "comment" TEXT,
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskAssessmentReview_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "RiskAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "requestId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_workspaceId_role_idx" ON "Membership"("workspaceId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_workspaceId_userId_key" ON "Membership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "AuditEntity_workspaceId_parentId_status_idx" ON "AuditEntity"("workspaceId", "parentId", "status");

-- CreateIndex
CREATE INDEX "AuditEntity_workspaceId_status_idx" ON "AuditEntity"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEntity_workspaceId_code_key" ON "AuditEntity"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "RiskModel_workspaceId_status_idx" ON "RiskModel"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RiskModel_workspaceId_name_version_key" ON "RiskModel"("workspaceId", "name", "version");

-- CreateIndex
CREATE INDEX "RiskFactor_riskModelId_sortOrder_idx" ON "RiskFactor"("riskModelId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RiskFactor_riskModelId_code_key" ON "RiskFactor"("riskModelId", "code");

-- CreateIndex
CREATE INDEX "RiskCycle_workspaceId_status_idx" ON "RiskCycle"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RiskCycle_workspaceId_name_key" ON "RiskCycle"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "RiskAssessment_workspaceId_cycleId_status_residualScore_idx" ON "RiskAssessment"("workspaceId", "cycleId", "status", "residualScore");

-- CreateIndex
CREATE INDEX "RiskAssessment_entityId_cycleId_idx" ON "RiskAssessment"("entityId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskAssessment_entityId_cycleId_version_key" ON "RiskAssessment"("entityId", "cycleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RiskFactorScore_assessmentId_riskFactorId_key" ON "RiskFactorScore"("assessmentId", "riskFactorId");

-- CreateIndex
CREATE INDEX "RiskAssessmentReview_assessmentId_createdAt_idx" ON "RiskAssessmentReview"("assessmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_objectType_objectId_createdAt_idx" ON "AuditEvent"("workspaceId", "objectType", "objectId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");
