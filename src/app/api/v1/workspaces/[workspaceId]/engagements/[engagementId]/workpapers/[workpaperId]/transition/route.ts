import { NextRequest } from "next/server";
import { transitionWorkpaperSchema } from "@/lib/schemas";
import { jsonOk, parseBody, requireWorkspaceAccess, withApi } from "@/server/api";
import { transitionWorkpaper } from "@/server/workpaper-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string; workpaperId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, workpaperId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "workpaper:read", meta);
    const input = await parseBody(request, transitionWorkpaperSchema);
    const workpaper = await transitionWorkpaper(access, engagementId, workpaperId, input);

    return jsonOk(workpaper, meta);
  });
}
