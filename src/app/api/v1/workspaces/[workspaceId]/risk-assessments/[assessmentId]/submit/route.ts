import { NextRequest } from "next/server";
import { reviewActionSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { submitAssessment } from "@/server/risk-service";

type Params = {
  params: Promise<{ workspaceId: string; assessmentId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, assessmentId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "assessment:submit",
      meta,
    );
    const input = await parseBody(request, reviewActionSchema);
    const assessment = await submitAssessment(
      access,
      assessmentId,
      input.version,
      input.comment,
    );

    return jsonOk(assessment, meta);
  });
}
