import { NextRequest } from "next/server";
import { z } from "zod";
import { createRiskModelSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { createRiskModel, listRiskModels } from "@/server/risk-service";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "riskModel:read",
      meta,
    );
    const models = await listRiskModels(access);

    return jsonOk(models, meta);
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "riskModel:write",
      meta,
    );
    const input = await parseBody(request, createRiskModelSchema);
    const model = await createRiskModel(access, input);

    return jsonOk(model, meta, { status: 201 });
  });
}

export const activateBodySchema = z.object({
  makeDefault: z.boolean().optional(),
});
