-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "workpaperId" TEXT,
    "rcmRowId" TEXT,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "cause" TEXT NOT NULL DEFAULT '',
    "effect" TEXT NOT NULL DEFAULT '',
    "recommendation" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ownerUserId" TEXT,
    "dueDate" DATETIME,
    "managementResponse" TEXT NOT NULL DEFAULT '',
    "plannedAction" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "updatedById" TEXT,
    "communicatedAt" DATETIME,
    "remediationStartedAt" DATETIME,
    "validationSubmittedAt" DATETIME,
    "validatedById" TEXT,
    "closedAt" DATETIME,
    "reopenedAt" DATETIME,
    "riskAcceptedAt" DATETIME,
    "riskAcceptedById" TEXT,
    "riskJustification" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Finding_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Finding_workpaperId_fkey" FOREIGN KEY ("workpaperId") REFERENCES "Workpaper" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Finding_rcmRowId_fkey" FOREIGN KEY ("rcmRowId") REFERENCES "EngagementRcmRow" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Finding_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Finding_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Finding_riskAcceptedById_fkey" FOREIGN KEY ("riskAcceptedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FindingUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "findingId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "statusFrom" TEXT NOT NULL,
    "statusTo" TEXT NOT NULL,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FindingUpdate_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FindingUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvidenceFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workpaperId" TEXT NOT NULL,
    "rcmRowId" TEXT,
    "findingId" TEXT,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "periodLabel" TEXT,
    "capturedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "uploadedById" TEXT,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deleteReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvidenceFile_workpaperId_fkey" FOREIGN KEY ("workpaperId") REFERENCES "Workpaper" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_rcmRowId_fkey" FOREIGN KEY ("rcmRowId") REFERENCES "EngagementRcmRow" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "EvidenceFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EvidenceFile" ("capturedAt", "createdAt", "deleteReason", "deletedAt", "deletedById", "fileName", "id", "label", "mimeType", "periodLabel", "rcmRowId", "sha256", "sizeBytes", "source", "storageKey", "supersedesId", "updatedAt", "uploadedById", "version", "workpaperId") SELECT "capturedAt", "createdAt", "deleteReason", "deletedAt", "deletedById", "fileName", "id", "label", "mimeType", "periodLabel", "rcmRowId", "sha256", "sizeBytes", "source", "storageKey", "supersedesId", "updatedAt", "uploadedById", "version", "workpaperId" FROM "EvidenceFile";
DROP TABLE "EvidenceFile";
ALTER TABLE "new_EvidenceFile" RENAME TO "EvidenceFile";
CREATE INDEX "EvidenceFile_workpaperId_deletedAt_idx" ON "EvidenceFile"("workpaperId", "deletedAt");
CREATE UNIQUE INDEX "EvidenceFile_workpaperId_label_version_key" ON "EvidenceFile"("workpaperId", "label", "version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Finding_engagementId_status_idx" ON "Finding"("engagementId", "status");

-- CreateIndex
CREATE INDEX "Finding_ownerUserId_status_idx" ON "Finding"("ownerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_engagementId_reference_key" ON "Finding"("engagementId", "reference");

-- CreateIndex
CREATE INDEX "FindingUpdate_findingId_createdAt_idx" ON "FindingUpdate"("findingId", "createdAt");

