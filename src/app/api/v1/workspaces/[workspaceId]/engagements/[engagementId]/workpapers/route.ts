import { NextRequest } from "next/server";
import { createWorkpaperSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import {
  createWorkpaper,
  listWorkpapers,
  summarizeWorkpaperPackageForEngagement,
} from "@/server/workpaper-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "workpaper:read", meta);
    const query = new URL(request.url).searchParams;

    if (query.get("view") === "package") {
      const summary = await summarizeWorkpaperPackageForEngagement(access, engagementId);
      return jsonOk(summary, meta);
    }

    return jsonOk(await listWorkpapers(access, engagementId), meta);
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "workpaper:write", meta);
    const input = await parseBody(request, createWorkpaperSchema);
    const workpaper = await createWorkpaper(access, engagementId, input);

    return jsonOk(workpaper, meta, { status: 201 });
  });
}
