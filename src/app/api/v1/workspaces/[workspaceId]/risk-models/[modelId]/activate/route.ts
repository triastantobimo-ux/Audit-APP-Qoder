import { NextRequest } from "next/server";
import { z } from "zod";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { activateRiskModel } from "@/server/risk-service";

type Params = {
  params: Promise<{ workspaceId: string; modelId: string }>;
};

const bodySchema = z.object({
  makeDefault: z.boolean().optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, modelId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "riskModel:activate",
      meta,
    );
    const input = await parseBody(request, bodySchema);
    const model = await activateRiskModel(
      access,
      modelId,
      input.makeDefault ?? true,
    );

    return jsonOk(model, meta);
  });
}
