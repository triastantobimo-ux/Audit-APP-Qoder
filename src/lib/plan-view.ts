import type { PlanBudget, PlanRole } from "./plan";

export type PlanUserView = {
  id: string;
  name: string;
  email: string;
};

export type PlanAllocationView = {
  role: PlanRole | string;
  estimatedHours: number;
};

export type PlanEngagementView = {
  id: string;
  planId: string;
  entityId: string;
  riskAssessmentId: string;
  title: string;
  engagementType: string;
  quarter: number | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  sourceRiskScore: number;
  sourceRiskLevel: string;
  sourceRationale: string | null;
  overrideScore: number | null;
  overrideReason: string | null;
  riskScore: number;
  riskLevel: string;
  estimatedHours: number;
  actualHours: number;
  status: string;
  notes: string | null;
  sortOrder: number;
  entity: {
    id: string;
    code: string;
    name: string;
    type: string;
    status: string;
  } | null;
  allocations: PlanAllocationView[];
};

export type PlanCapacityView = {
  role: PlanRole | string;
  availableHours: number;
};

export type PlanCoverageView = {
  coveredCount: number;
  totalCount: number;
  coveragePercent: number;
  highCriticalCovered: number;
  highCriticalTotal: number;
  highCriticalCoveragePercent: number;
};

export type PlanWarningView = {
  role: PlanRole;
  estimatedHours: number;
  availableHours: number;
  overBy: number;
  kind: "exceeded" | "unconfigured";
};

export type PlanSummaryView = {
  engagementCount: number;
  budget: PlanBudget;
  coverage: PlanCoverageView;
  warnings: PlanWarningView[];
};

export type PlanBaseView = {
  id: string;
  workspaceId: string;
  year: number;
  name: string;
  objective: string;
  scope: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  version: number;
  isCurrent: boolean;
  supersedesId: string | null;
  changeReason: string | null;
  owner: PlanUserView | null;
  approvedBy: PlanUserView | null;
  createdById: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  summary: PlanSummaryView;
};

export type PlanListItem = PlanBaseView;

export type PlanView = PlanBaseView & {
  engagements: PlanEngagementView[];
  capacities: PlanCapacityView[];
};
