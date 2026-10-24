import { NextRequest } from "next/server";
import { createEngagementSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import {
  createEngagement,
  listEngagements,
} from "@/server/engagement-service";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "engagement:read",
      meta,
    );
    return jsonOk(await listEngagements(access), meta);
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "engagement:write",
      meta,
    );
    const input = await parseBody(request, createEngagementSchema);
    const engagement = await createEngagement(access, input);

    return jsonOk(engagement, meta, { status: 201 });
  });
}
