import { NextRequest } from "next/server";
import { planVersionSchema, updatePlanEngagementSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import {
  deletePlanEngagement,
  updatePlanEngagement,
} from "@/server/plan-service";

type Params = {
  params: Promise<{
    workspaceId: string;
    planId: string;
    engagementId: string;
  }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const { workspaceId, planId, engagementId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "plan:write", meta);
    const input = await parseBody(request, updatePlanEngagementSchema);

    return jsonOk(
      await updatePlanEngagement(access, planId, engagementId, input),
      meta,
    );
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { workspaceId, planId, engagementId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "plan:write", meta);
    const input = await parseBody(request, planVersionSchema);

    return jsonOk(
      await deletePlanEngagement(access, planId, engagementId, input.version),
      meta,
    );
  });
}
