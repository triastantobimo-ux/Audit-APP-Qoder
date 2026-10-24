-- CreateTable
CREATE TABLE "Workpaper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "procedure" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL DEFAULT '',
    "templateKey" TEXT,
    "rcmRowId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "preparerId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "submittedAt" DATETIME,
    "reviewedAt" DATETIME,
    "signedOffAt" DATETIME,
    "signedOffById" TEXT,
    "signedOffByName" TEXT,
    "signoffHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workpaper_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Workpaper_rcmRowId_fkey" FOREIGN KEY ("rcmRowId") REFERENCES "EngagementRcmRow" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Workpaper_preparerId_fkey" FOREIGN KEY ("preparerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Workpaper_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Workpaper_signedOffById_fkey" FOREIGN KEY ("signedOffById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkpaperNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workpaperId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'minor',
    "status" TEXT NOT NULL DEFAULT 'open',
    "authorId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkpaperNote_workpaperId_fkey" FOREIGN KEY ("workpaperId") REFERENCES "Workpaper" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkpaperNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkpaperNote_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkpaperNote_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workpaperId" TEXT NOT NULL,
    "rcmRowId" TEXT,
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
    CONSTRAINT "EvidenceFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "EvidenceFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Workpaper_engagementId_status_idx" ON "Workpaper"("engagementId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Workpaper_engagementId_reference_key" ON "Workpaper"("engagementId", "reference");

-- CreateIndex
CREATE INDEX "WorkpaperNote_workpaperId_status_idx" ON "WorkpaperNote"("workpaperId", "status");

-- CreateIndex
CREATE INDEX "EvidenceFile_workpaperId_deletedAt_idx" ON "EvidenceFile"("workpaperId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceFile_workpaperId_label_version_key" ON "EvidenceFile"("workpaperId", "label", "version");
