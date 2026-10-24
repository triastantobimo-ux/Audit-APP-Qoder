import { z } from "zod";
import {
  findingSeverities,
  findingStatuses,
} from "./finding";
import {
  evidenceSources,
  noteSeverities,
  workpaperStatuses,
} from "./workpaper";

export const entityTypeSchema = z.enum([
  "organization_unit",
  "business_process",
  "risk_domain",
  "system",
  "third_party",
  "other",
]);

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

export const createEntitySchema = z.object({
  code: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(255),
  type: entityTypeSchema,
  parentId: z.string().trim().min(1).nullable().optional(),
  ownerUserId: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateEntitySchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  ownerUserId: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  version: z.number().int().positive(),
});

export const moveEntitySchema = z.object({
  parentId: z.string().trim().min(1).nullable(),
  version: z.number().int().positive(),
});

export const archiveEntitySchema = z.object({
  version: z.number().int().positive(),
});

const riskLevelThresholdsSchema = z.object({
  low: z.number().min(0),
  medium: z.number().min(0),
  high: z.number().min(0),
  critical: z.number().min(0),
});

export const createRiskModelSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  scale: z
    .object({
      min: z.number().int().min(0).max(10),
      max: z.number().int().min(1).max(10),
    })
    .refine((value) => value.min < value.max, {
      message: "scale.min must be below scale.max",
    }),
  controlReductionMax: z.number().min(0).max(1),
  levelThresholds: riskLevelThresholdsSchema,
  isDefault: z.boolean().optional(),
  factors: z
    .array(
      z.object({
        code: z.string().trim().min(2).max(50),
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().max(1000).nullable().optional(),
        weight: z.number().positive().max(1),
        isRequired: z.boolean().optional(),
      }),
    )
    .min(1),
});

export const createCycleSchema = z.object({
  name: z.string().trim().min(2).max(160),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

export const createAssessmentSchema = z.object({
  cycleId: z.string().trim().min(1),
  riskModelId: z.string().trim().min(1),
  controlEffectivenessScore: z.number().min(1).max(5),
  rationale: z.string().trim().min(10).max(4000),
});

export const updateAssessmentSchema = z.object({
  controlEffectivenessScore: z.number().min(1).max(5).optional(),
  rationale: z.string().trim().min(10).max(4000).optional(),
  version: z.number().int().positive(),
});

export const factorScoresSchema = z.object({
  scores: z
    .array(
      z.object({
        factorCode: z.string().trim().min(1),
        score: z.number().min(0).max(10),
        rationale: z.string().trim().max(2000).optional(),
        evidenceNote: z.string().trim().max(2000).optional(),
      }),
    )
    .min(1),
  version: z.number().int().positive(),
});

export const reviewActionSchema = z.object({
  comment: z.string().trim().max(2000).optional(),
  version: z.number().int().positive(),
});

export const newVersionSchema = z.object({
  comment: z.string().trim().max(2000).optional(),
});

export const planRoleSchema = z.enum(["CAE", "MANAGER", "AUDITOR", "REVIEWER"]);

export const planEngagementTypeSchema = z.enum([
  "financial",
  "operational",
  "compliance",
  "sox",
  "it",
  "fraud",
  "other",
]);

export const planEngagementStatusSchema = z.enum([
  "planned",
  "in_progress",
  "completed",
  "deferred",
]);

const planCapacityRowSchema = z.object({
  role: planRoleSchema,
  availableHours: z.number().min(0).max(100000),
});

export const createPlanSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  name: z.string().trim().min(3).max(200),
  objective: z.string().trim().min(10).max(4000),
  scope: z.string().trim().min(10).max(4000),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  ownerUserId: z.string().trim().min(1).optional(),
  capacity: z.array(planCapacityRowSchema).max(10).optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  objective: z.string().trim().min(10).max(4000).optional(),
  scope: z.string().trim().min(10).max(4000).optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  ownerUserId: z.string().trim().min(1).optional(),
  version: z.number().int().positive(),
});

const planAllocationSchema = z.object({
  role: planRoleSchema,
  hours: z.number().positive().max(100000),
});

const optionalPlanDate = z.string().datetime().nullable().optional();

export const createPlanEngagementSchema = z.object({
  entityId: z.string().trim().min(1),
  title: z.string().trim().min(2).max(200),
  engagementType: planEngagementTypeSchema.optional(),
  quarter: z.number().int().min(1).max(4).nullable().optional(),
  plannedStart: optionalPlanDate,
  plannedEnd: optionalPlanDate,
  allocations: z.array(planAllocationSchema).min(1).max(4),
  overrideScore: z.number().min(0).max(10).nullable().optional(),
  overrideReason: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  version: z.number().int().positive(),
});

export const updatePlanEngagementSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  engagementType: planEngagementTypeSchema.optional(),
  quarter: z.number().int().min(1).max(4).nullable().optional(),
  plannedStart: optionalPlanDate,
  plannedEnd: optionalPlanDate,
  allocations: z.array(planAllocationSchema).min(1).max(4).optional(),
  overrideScore: z.number().min(0).max(10).nullable().optional(),
  overrideReason: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  version: z.number().int().positive(),
});

export const updateEngagementActualsSchema = z.object({
  actualHours: z.number().min(0).max(100000),
  status: planEngagementStatusSchema,
  version: z.number().int().positive(),
});

export const replacePlanCapacitySchema = z.object({
  capacity: z.array(planCapacityRowSchema).max(10),
  version: z.number().int().positive(),
});

export const newPlanVersionSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
  version: z.number().int().positive(),
});

export const planVersionSchema = z.object({
  version: z.number().int().positive(),
});

export type CreateEntityInput = z.infer<typeof createEntitySchema>;
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;
export type CreateRiskModelInput = z.infer<typeof createRiskModelSchema>;
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type FactorScoresInput = z.infer<typeof factorScoresSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type CreatePlanEngagementInput = z.infer<
  typeof createPlanEngagementSchema
>;
export type UpdatePlanEngagementInput = z.infer<
  typeof updatePlanEngagementSchema
>;
export type UpdateEngagementActualsInput = z.infer<
  typeof updateEngagementActualsSchema
>;
export type ReplacePlanCapacityInput = z.infer<
  typeof replacePlanCapacitySchema
>;
export type NewPlanVersionInput = z.infer<typeof newPlanVersionSchema>;

export const engagementTypeSchema = z.enum([
  "financial",
  "operational",
  "compliance",
  "sox",
  "it",
]);

export const engagementStatusSchema = z.enum([
  "draft",
  "planning",
  "fieldwork",
  "review",
  "issued",
  "closed",
]);

export const auditAssertionSchema = z.enum([
  "existence",
  "completeness",
  "accuracy",
  "cutoff",
  "classification",
  "occurrence",
  "authorization",
  "valuation",
  "rights_obligations",
  "presentation",
]);

const engagementTeamSchema = z.object({
  preparerId: z.string().trim().min(1),
  reviewerId: z.string().trim().min(1),
  approverId: z.string().trim().min(1),
});

export const createEngagementSchema = engagementTeamSchema.extend({
  title: z.string().trim().min(3).max(200),
  engagementType: engagementTypeSchema,
  templateKey: engagementTypeSchema.optional(),
  planEngagementId: z.string().trim().min(1).nullable().optional(),
  entityId: z.string().trim().min(1).nullable().optional(),
  riskAssessmentId: z.string().trim().min(1).nullable().optional(),
  adHocReason: z.string().trim().max(2000).nullable().optional(),
  objective: z.string().trim().max(4000).optional(),
  scope: z.string().trim().max(4000).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  budgetHours: z.number().positive().max(100000),
});

export const updateEngagementSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  engagementType: engagementTypeSchema.optional(),
  objective: z.string().trim().min(10).max(4000).optional(),
  scope: z.string().trim().min(10).max(4000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budgetHours: z.number().positive().max(100000).optional(),
  preparerId: z.string().trim().min(1).optional(),
  reviewerId: z.string().trim().min(1).optional(),
  approverId: z.string().trim().min(1).optional(),
  version: z.number().int().positive(),
});

const rcmRowSchema = z.object({
  riskDescription: z.string().trim().min(3).max(2000),
  controlDescription: z.string().trim().min(3).max(2000),
  assertion: auditAssertionSchema,
  procedureDescription: z.string().trim().min(3).max(4000),
  evidenceRequirement: z.string().trim().min(3).max(2000),
});

export const createRcmRowSchema = rcmRowSchema.extend({
  version: z.number().int().positive(),
});

export const updateRcmRowSchema = rcmRowSchema.partial().extend({
  version: z.number().int().positive(),
});

export const deleteRcmRowSchema = z.object({
  version: z.number().int().positive(),
});

export const reorderRcmRowsSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1).max(200),
  version: z.number().int().positive(),
});

export const transitionEngagementSchema = z.object({
  toStatus: engagementStatusSchema,
  note: z.string().trim().max(2000).nullable().optional(),
  version: z.number().int().positive(),
});

export type CreateEngagementInput = z.infer<typeof createEngagementSchema>;
export type UpdateEngagementInput = z.infer<typeof updateEngagementSchema>;
export type CreateRcmRowInput = z.infer<typeof createRcmRowSchema>;
export type UpdateRcmRowInput = z.infer<typeof updateRcmRowSchema>;
export type ReorderRcmRowsInput = z.infer<typeof reorderRcmRowsSchema>;
export type TransitionEngagementInput = z.infer<
  typeof transitionEngagementSchema
>;

export const workpaperTemplateSchema = z.enum([
  "test_of_control",
  "substantive_test",
  "analytical_review",
]);

export const createWorkpaperSchema = z.object({
  title: z.string().trim().min(3).max(200),
  purpose: z.string().trim().min(10).max(4000),
  procedure: z.string().trim().min(3).max(8000),
  conclusion: z.string().trim().max(8000).optional(),
  templateKey: workpaperTemplateSchema.optional(),
  rcmRowId: z.string().trim().min(1).nullable().optional(),
  preparerId: z.string().trim().min(1).optional(),
  reviewerId: z.string().trim().min(1).optional(),
});

export const updateWorkpaperSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  purpose: z.string().trim().min(10).max(4000).optional(),
  procedure: z.string().trim().min(3).max(8000).optional(),
  conclusion: z.string().trim().max(8000).optional(),
  rcmRowId: z.string().trim().min(1).nullable().optional(),
  version: z.number().int().positive(),
});

export const transitionWorkpaperSchema = z.object({
  toStatus: z.enum(workpaperStatuses),
  note: z.string().trim().max(2000).nullable().optional(),
  version: z.number().int().positive(),
});

export const createWorkpaperNoteSchema = z.object({
  body: z.string().trim().min(3).max(4000),
  severity: z.enum(noteSeverities),
  assigneeId: z.string().trim().min(1).nullable().optional(),
});

export const resolveWorkpaperNoteSchema = z.object({
  resolution: z.string().trim().min(10).max(4000),
});

export const uploadEvidenceSchema = z.object({
  label: z.string().trim().min(3).max(200),
  source: z.enum(evidenceSources),
  periodLabel: z.string().trim().max(120).nullable().optional(),
  capturedAt: z.string().trim().min(1),
  rcmRowId: z.string().trim().min(1).nullable().optional(),
  supersedesId: z.string().trim().min(1).nullable().optional(),
});

export const deleteEvidenceSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export type CreateWorkpaperInput = z.infer<typeof createWorkpaperSchema>;
export type UpdateWorkpaperInput = z.infer<typeof updateWorkpaperSchema>;
export type TransitionWorkpaperInput = z.infer<
  typeof transitionWorkpaperSchema
>;
export type CreateWorkpaperNoteInput = z.infer<
  typeof createWorkpaperNoteSchema
>;
export type ResolveWorkpaperNoteInput = z.infer<
  typeof resolveWorkpaperNoteSchema
>;
export type UploadEvidenceInput = z.infer<typeof uploadEvidenceSchema>;
export type DeleteEvidenceInput = z.infer<typeof deleteEvidenceSchema>;

export const findingSeveritySchema = z.enum(findingSeverities);
export const findingStatusSchema = z.enum(findingStatuses);

const findingText = z.string().trim().min(5).max(4000);
const findingMemberId = z.string().trim().min(1);

export const createFindingSchema = z.object({
  title: z.string().trim().min(3).max(200),
  condition: findingText,
  criteria: findingText,
  cause: findingText.optional(),
  effect: findingText.optional(),
  recommendation: findingText.optional(),
  severity: findingSeveritySchema.optional(),
  workpaperId: findingMemberId.nullable().optional(),
  rcmRowId: findingMemberId.nullable().optional(),
  ownerUserId: findingMemberId.nullable().optional(),
  dueDate: z.string().trim().min(1).nullable().optional(),
});

export const updateFindingSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  condition: findingText.optional(),
  criteria: findingText.optional(),
  cause: findingText.nullable().optional(),
  effect: findingText.nullable().optional(),
  recommendation: findingText.nullable().optional(),
  severity: findingSeveritySchema.optional(),
  workpaperId: findingMemberId.nullable().optional(),
  rcmRowId: findingMemberId.nullable().optional(),
  ownerUserId: findingMemberId.nullable().optional(),
  dueDate: z.string().trim().min(1).nullable().optional(),
  version: z.number().int().positive(),
});

export const findingResponseSchema = z.object({
  response: z.string().trim().min(10).max(4000),
  plannedAction: z.string().trim().min(10).max(4000),
  dueDate: z.string().trim().min(1),
  ownerUserId: findingMemberId.optional(),
  version: z.number().int().positive(),
});

export const transitionFindingSchema = z.object({
  toStatus: findingStatusSchema,
  note: z.string().trim().max(4000).nullable().optional(),
  version: z.number().int().positive(),
});

export const createFindingUpdateSchema = z.object({
  body: z.string().trim().min(10).max(4000),
  progressPercent: z.number().int().min(0).max(100).optional(),
  version: z.number().int().positive(),
});

export type CreateFindingInput = z.infer<typeof createFindingSchema>;
export type UpdateFindingInput = z.infer<typeof updateFindingSchema>;
export type FindingResponseInput = z.infer<typeof findingResponseSchema>;
export type TransitionFindingInput = z.infer<typeof transitionFindingSchema>;
export type CreateFindingUpdateInput = z.infer<typeof createFindingUpdateSchema>;
