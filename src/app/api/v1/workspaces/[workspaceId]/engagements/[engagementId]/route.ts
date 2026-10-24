import { NextRequest } from "next/server";
import { updateEngagementSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import {
  getEngagement,
  updateEngagement,
} from "@/server/engagement-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "engagement:read",
      meta,
    );
    return jsonOk(await getEngagement(access, engagementId), meta);
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "engagement:write",
      meta,
    );
    const input = await parseBody(request, updateEngagementSchema);
    const engagement = await updateEngagement(access, engagementId, input);

    return jsonOk(engagement, meta);
  });
}
