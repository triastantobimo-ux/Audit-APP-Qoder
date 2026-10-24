import { NextRequest } from "next/server";
import {
  jsonOk,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { retireRiskModel } from "@/server/risk-service";

type Params = {
  params: Promise<{ workspaceId: string; modelId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, modelId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "riskModel:write",
      meta,
    );
    const model = await retireRiskModel(access, modelId);

    return jsonOk(model, meta);
  });
}
