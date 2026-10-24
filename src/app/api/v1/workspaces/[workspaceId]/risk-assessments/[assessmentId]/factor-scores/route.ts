import { NextRequest } from "next/server";
import { factorScoresSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { upsertFactorScores } from "@/server/risk-service";

type Params = {
  params: Promise<{ workspaceId: string; assessmentId: string }>;
};

export async function PUT(request: NextRequest, { params }: Params) {
  const { workspaceId, assessmentId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "assessment:write",
      meta,
    );
    const input = await parseBody(request, factorScoresSchema);
    const assessment = await upsertFactorScores(access, assessmentId, input);

    return jsonOk(assessment, meta);
  });
}
