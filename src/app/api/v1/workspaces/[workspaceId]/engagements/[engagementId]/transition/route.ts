import { NextRequest } from "next/server";
import { transitionEngagementSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { transitionEngagement } from "@/server/engagement-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "engagement:read",
      meta,
    );
    const input = await parseBody(request, transitionEngagementSchema);
    const engagement = await transitionEngagement(
      access,
      engagementId,
      input,
    );

    return jsonOk(engagement, meta);
  });
}
