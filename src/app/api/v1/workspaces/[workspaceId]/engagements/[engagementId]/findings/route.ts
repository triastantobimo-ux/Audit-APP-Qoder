import { NextRequest } from "next/server";
import { createFindingSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { createFinding, listEngagementFindings } from "@/server/finding-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "finding:read", meta);

    return jsonOk(await listEngagementFindings(access, engagementId), meta);
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "finding:write", meta);
    const input = await parseBody(request, createFindingSchema);
    const finding = await createFinding(access, engagementId, input);

    return jsonOk(finding, meta, { status: 201 });
  });
}
