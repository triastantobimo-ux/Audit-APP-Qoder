import { NextRequest } from "next/server";
import { findingResponseSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { respondFinding } from "@/server/finding-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string; findingId: string }>;
};

export async function PUT(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, findingId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "finding:respond", meta);
    const input = await parseBody(request, findingResponseSchema);
    const finding = await respondFinding(access, engagementId, findingId, input);

    return jsonOk(finding, meta);
  });
}
