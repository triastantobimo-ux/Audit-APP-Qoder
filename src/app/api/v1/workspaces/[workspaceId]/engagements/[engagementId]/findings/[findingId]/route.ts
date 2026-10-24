import { NextRequest } from "next/server";
import { updateFindingSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { getFinding, updateFinding } from "@/server/finding-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string; findingId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, findingId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "finding:read", meta);

    return jsonOk(await getFinding(access, engagementId, findingId), meta);
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, findingId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "finding:write", meta);
    const input = await parseBody(request, updateFindingSchema);
    const finding = await updateFinding(access, engagementId, findingId, input);

    return jsonOk(finding, meta);
  });
}
