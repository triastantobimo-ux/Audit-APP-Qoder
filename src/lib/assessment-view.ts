export type RiskFactorView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  weight: number;
  isRequired: boolean;
  sortOrder: number;
};

export type RiskModelView = {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
  version: number;
  methodologyVersion: string;
  scale: { min: number; max: number };
  controlReductionMax: number;
  levelThresholds: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  factors: RiskFactorView[];
};

export type AssessmentFactorView = {
  factorId: string;
  code: string;
  name: string;
  weight: number;
  score: number | null;
  rationale: string | null;
  evidenceNote: string | null;
};

export type AssessmentReviewView = {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  comment: string | null;
  actorName: string;
  createdAt: string | null;
};

export type AssessmentView = {
  id: string;
  workspaceId?: string;
  entityId?: string;
  cycleId?: string;
  riskModelId?: string;
  status: string;
  inherentScore: number | null;
  residualScore: number | null;
  riskLevel: string | null;
  controlEffectivenessScore: number | null;
  rationale: string | null;
  isCurrent: boolean;
  version: number;
  submittedAt: string | null;
  approvedAt: string | null;
  assessedAt: string | null;
  assessedById: string | null;
  assessedByName?: string | null;
  approvedById: string | null;
  approvedByName?: string | null;
  cycle: { id: string; name: string } | null;
  riskModel: RiskModelView | null;
  factorScores: AssessmentFactorView[];
  reviews: AssessmentReviewView[];
};
