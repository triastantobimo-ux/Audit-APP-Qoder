import { NextRequest } from "next/server";
import { updateAssessmentSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { getAssessment, updateAssessment } from "@/server/risk-service";

type Params = {
  params: Promise<{ workspaceId: string; assessmentId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, assessmentId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "assessment:read",
      meta,
    );
    const assessment = await getAssessment(access, assessmentId);

    return jsonOk(assessment, meta);
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { workspaceId, assessmentId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "assessment:write",
      meta,
    );
    const input = await parseBody(request, updateAssessmentSchema);
    const assessment = await updateAssessment(access, assessmentId, input);

    return jsonOk(assessment, meta);
  });
}
