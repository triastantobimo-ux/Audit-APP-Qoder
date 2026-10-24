import { NextRequest } from "next/server";
import { updateWorkpaperSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { getWorkpaper, updateWorkpaper } from "@/server/workpaper-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string; workpaperId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, workpaperId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "workpaper:read", meta);
    return jsonOk(await getWorkpaper(access, engagementId, workpaperId), meta);
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, workpaperId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "workpaper:write", meta);
    const input = await parseBody(request, updateWorkpaperSchema);
    const workpaper = await updateWorkpaper(access, engagementId, workpaperId, input);

    return jsonOk(workpaper, meta);
  });
}
