import { NextRequest } from "next/server";
import { createRcmRowSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { addRcmRow } from "@/server/engagement-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "engagement:write",
      meta,
    );
    const input = await parseBody(request, createRcmRowSchema);
    const engagement = await addRcmRow(access, engagementId, input);

    return jsonOk(engagement, meta, { status: 201 });
  });
}
