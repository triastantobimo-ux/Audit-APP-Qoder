import { NextRequest } from "next/server";
import { updateEngagementActualsSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { updatePlanEngagementActuals } from "@/server/plan-service";

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
    const input = await parseBody(request, updateEngagementActualsSchema);

    return jsonOk(
      await updatePlanEngagementActuals(access, planId, engagementId, input),
      meta,
    );
  });
}
