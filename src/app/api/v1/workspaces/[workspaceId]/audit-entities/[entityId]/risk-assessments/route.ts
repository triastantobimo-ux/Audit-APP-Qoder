import { NextRequest } from "next/server";
import { createAssessmentSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import {
  createAssessment,
  listAssessmentsForEntity,
} from "@/server/risk-service";

type Params = {
  params: Promise<{ workspaceId: string; entityId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, entityId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "assessment:read",
      meta,
    );
    const assessments = await listAssessmentsForEntity(access, entityId);

    return jsonOk(assessments, meta);
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, entityId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "assessment:write",
      meta,
    );
    const input = await parseBody(request, createAssessmentSchema);
    const assessment = await createAssessment(access, entityId, input);

    return jsonOk(assessment, meta, { status: 201 });
  });
}
