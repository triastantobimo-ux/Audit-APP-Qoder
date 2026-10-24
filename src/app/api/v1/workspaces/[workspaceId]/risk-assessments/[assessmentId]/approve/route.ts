import { NextRequest } from "next/server";
import { reviewActionSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { approveAssessment } from "@/server/risk-service";

type Params = {
  params: Promise<{ workspaceId: string; assessmentId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, assessmentId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "assessment:approve",
      meta,
    );
    const input = await parseBody(request, reviewActionSchema);
    const assessment = await approveAssessment(
      access,
      assessmentId,
      input.version,
      input.comment,
    );

    return jsonOk(assessment, meta);
  });
}
