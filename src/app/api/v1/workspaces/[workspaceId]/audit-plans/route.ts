import { NextRequest } from "next/server";
import { createPlanSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { createPlan, listPlans } from "@/server/plan-service";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "plan:read", meta);
    return jsonOk(await listPlans(access), meta);
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "plan:write", meta);
    const input = await parseBody(request, createPlanSchema);
    const plan = await createPlan(access, input);

    return jsonOk(plan, meta, { status: 201 });
  });
}
