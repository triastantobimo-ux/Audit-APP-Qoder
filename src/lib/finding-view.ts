import type { RemediationSummary } from "./finding";

export type FindingMemberView = {
  id: string;
  name: string;
  email?: string;
};

export type FindingEngagementView = {
  id: string;
  code: string;
  title: string;
  status: string;
};

export type FindingRefView = {
  id: string;
  reference: string;
  title: string;
};

export type FindingRcmView = {
  id: string;
  riskDescription: string;
  controlDescription: string;
};

export type FindingEvidenceView = {
  id: string;
  label: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  version: number;
  uploadedBy: FindingMemberView | null;
  deletedAt: string | null;
};

export type FindingUpdateView = {
  id: string;
  body: string;
  statusFrom: string;
  statusTo: string;
  progressPercent: number;
  author: FindingMemberView;
  createdAt: string;
};

export type FindingActionsView = {
  canEdit: boolean;
  canCommunicate: boolean;
  canRespond: boolean;
  canAddUpdate: boolean;
  canSubmitForValidation: boolean;
  canValidate: boolean;
  canReopen: boolean;
  canAcceptRisk: boolean;
};

export type FindingListItem = {
  id: string;
  reference: string;
  title: string;
  status: string;
  severity: string;
  progressPercent: number;
  version: number;
  dueDate: string | null;
  isOverdue: boolean;
  owner: FindingMemberView | null;
  engagement: FindingEngagementView;
  workpaper: FindingRefView | null;
  closedAt: string | null;
  riskAcceptedAt: string | null;
  updatedAt: string;
};

export type FindingView = FindingListItem & {
  engagementId: string;
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  recommendation: string;
  managementResponse: string;
  plannedAction: string;
  riskJustification: string;
  rcmRow: FindingRcmView | null;
  validatedBy: FindingMemberView | null;
  riskAcceptedBy: FindingMemberView | null;
  createdBy: FindingMemberView | null;
  communicatedAt: string | null;
  remediationStartedAt: string | null;
  validationSubmittedAt: string | null;
  reopenedAt: string | null;
  createdAt: string;
  evidence: FindingEvidenceView[];
  updates: FindingUpdateView[];
  readiness: { ready: boolean; missing: string[] };
  actions: FindingActionsView;
};

export type FindingRegisterView = {
  scope: "mine" | "all";
  totals: RemediationSummary;
  items: FindingListItem[];
};
