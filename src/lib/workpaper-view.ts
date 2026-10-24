export type WorkpaperMemberView = {
  id: string;
  name: string;
  email?: string;
};

export type WorkpaperRcmLinkView = {
  id: string;
  riskDescription: string;
  procedureDescription: string;
  evidenceRequirement: string;
};

export type WorkpaperEvidenceView = {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  source: string;
  periodLabel: string | null;
  capturedAt: string;
  version: number;
  supersedesId: string | null;
  uploadedBy: WorkpaperMemberView | null;
  deletedAt: string | null;
  deletedBy: WorkpaperMemberView | null;
  deleteReason: string | null;
  createdAt: string;
};

export type WorkpaperNoteView = {
  id: string;
  body: string;
  severity: string;
  status: string;
  author: WorkpaperMemberView;
  assignee: WorkpaperMemberView | null;
  resolution: string | null;
  resolvedBy: WorkpaperMemberView | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type WorkpaperActionsView = {
  canEdit: boolean;
  canUploadEvidence: boolean;
  canDeleteEvidence: boolean;
  canAddNote: boolean;
  canResolveNote: boolean;
  canSubmit: boolean;
  canMarkReviewed: boolean;
  canReturn: boolean;
  canSignOff: boolean;
};

export type WorkpaperListItem = {
  id: string;
  reference: string;
  title: string;
  status: string;
  version: number;
  templateKey: string | null;
  rcmRow: WorkpaperRcmLinkView | null;
  preparer: WorkpaperMemberView;
  reviewer: WorkpaperMemberView;
  evidenceCount: number;
  openNotes: number;
  openBlockingNotes: number;
  packageComplete: boolean;
  packageMissing: string[];
  signedOffAt: string | null;
  signedOffByName: string | null;
  updatedAt: string;
};

export type WorkpaperView = WorkpaperListItem & {
  engagementId: string;
  purpose: string;
  procedure: string;
  conclusion: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  signedOffById: string | null;
  signoffHash: string | null;
  notes: WorkpaperNoteView[];
  evidence: WorkpaperEvidenceView[];
  actions: WorkpaperActionsView;
};

export type WorkpaperEngagementSummary = {
  id: string;
  code: string;
  title: string;
  status: string;
  version: number;
};

export type WorkpaperPackageSummary = {
  engagement: WorkpaperEngagementSummary;
  totals: {
    workpapers: number;
    signedOff: number;
    inReview: number;
    draft: number;
    evidence: number;
    openBlockingNotes: number;
  };
  items: WorkpaperListItem[];
};
