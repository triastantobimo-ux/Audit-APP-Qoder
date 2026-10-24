import { NextRequest } from "next/server";
import { createFindingUpdateSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { addFindingUpdate } from "@/server/finding-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string; findingId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, findingId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "finding:read", meta);
    const input = await parseBody(request, createFindingUpdateSchema);
    const finding = await addFindingUpdate(access, engagementId, findingId, input);

    return jsonOk(finding, meta, { status: 201 });
  });
}
