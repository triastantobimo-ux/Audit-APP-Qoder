export type EngagementMemberView = {
  id: string;
  name: string;
  email: string;
  role?: string;
};

export type EngagementEntityView = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  riskScore?: number | null;
  riskLevel?: string | null;
};

export type EngagementPlanLinkView = {
  id: string;
  year: number;
  name: string;
  status: string;
  title: string;
  estimatedHours: number;
  quarter: number | null;
};

export type EngagementRcmRowView = {
  id: string;
  sortOrder: number;
  riskDescription: string;
  controlDescription: string;
  assertion: string;
  procedureDescription: string;
  evidenceRequirement: string;
};

export type EngagementTransitionView = {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  actor: { id: string; name: string } | null;
  createdAt: string;
};

export type EngagementCoverageView = {
  totalRows: number;
  completeRows: number;
  incompleteRows: number;
  rowsMissingProcedure: number;
  rowsMissingEvidence: number;
  coveragePercent: number;
};

export type EngagementListItem = {
  id: string;
  code: string;
  title: string;
  engagementType: string;
  templateKey: string | null;
  status: string;
  version: number;
  startDate: string;
  endDate: string;
  budgetHours: number;
  entity: EngagementEntityView | null;
  plan: EngagementPlanLinkView | null;
  preparer: EngagementMemberView | null;
  reviewer: EngagementMemberView | null;
  approver: EngagementMemberView | null;
  coverage: EngagementCoverageView;
  updatedAt: string;
};

export type EngagementView = EngagementListItem & {
  workspaceId: string;
  objective: string;
  scope: string;
  adHocReason: string | null;
  riskAssessment: {
    id: string;
    residualScore: number | null;
    riskLevel: string | null;
    approvedAt: string | null;
  } | null;
  rcmRows: EngagementRcmRowView[];
  transitions: EngagementTransitionView[];
  createdById: string | null;
  issuedAt: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type EngagementPlanCandidate = {
  id: string;
  title: string;
  engagementType: string;
  quarter: number | null;
  estimatedHours: number;
  riskScore: number;
  riskLevel: string;
  entity: EngagementEntityView;
  plan: EngagementPlanLinkView;
};

export type EngagementCreateOptions = {
  planCandidates: EngagementPlanCandidate[];
  entities: EngagementEntityView[];
  members: EngagementMemberView[];
};
