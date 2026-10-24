import { NextRequest } from "next/server";
import { createWorkpaperNoteSchema } from "@/lib/schemas";
import { jsonOk, parseBody, requireWorkspaceAccess, withApi } from "@/server/api";
import { addWorkpaperNote } from "@/server/workpaper-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string; workpaperId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, workpaperId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "workpaper:read", meta);
    const input = await parseBody(request, createWorkpaperNoteSchema);
    const workpaper = await addWorkpaperNote(access, engagementId, workpaperId, input);

    return jsonOk(workpaper, meta, { status: 201 });
  });
}
