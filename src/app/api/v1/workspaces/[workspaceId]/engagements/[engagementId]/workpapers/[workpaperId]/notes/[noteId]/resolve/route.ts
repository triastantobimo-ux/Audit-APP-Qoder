import { NextRequest } from "next/server";
import { resolveWorkpaperNoteSchema } from "@/lib/schemas";
import { jsonOk, parseBody, requireWorkspaceAccess, withApi } from "@/server/api";
import { resolveWorkpaperNote } from "@/server/workpaper-service";

type Params = {
  params: Promise<{
    workspaceId: string;
    engagementId: string;
    workpaperId: string;
    noteId: string;
  }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, workpaperId, noteId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "workpaper:read", meta);
    const input = await parseBody(request, resolveWorkpaperNoteSchema);
    const workpaper = await resolveWorkpaperNote(
      access,
      engagementId,
      workpaperId,
      noteId,
      input,
    );

    return jsonOk(workpaper, meta);
  });
}
