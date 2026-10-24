import { NextRequest } from "next/server";
import { newVersionSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { newAssessmentVersion } from "@/server/risk-service";

type Params = {
  params: Promise<{ workspaceId: string; assessmentId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, assessmentId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "assessment:write",
      meta,
    );
    await parseBody(request, newVersionSchema);
    const assessment = await newAssessmentVersion(access, assessmentId);

    return jsonOk(assessment, meta, { status: 201 });
  });
}
