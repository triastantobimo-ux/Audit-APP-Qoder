import { NextRequest } from "next/server";
import { createPlanEngagementSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { addPlanEngagement } from "@/server/plan-service";

type Params = { params: Promise<{ workspaceId: string; planId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, planId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "plan:write", meta);
    const input = await parseBody(request, createPlanEngagementSchema);
    const plan = await addPlanEngagement(access, planId, input);

    return jsonOk(plan, meta, { status: 201 });
  });
}
