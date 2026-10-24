import { NextRequest } from "next/server";
import { deleteEvidenceSchema } from "@/lib/schemas";
import { jsonOk, parseBody, requireWorkspaceAccess, withApi } from "@/server/api";
import { deleteEvidence } from "@/server/workpaper-service";

type Params = {
  params: Promise<{
    workspaceId: string;
    engagementId: string;
    workpaperId: string;
    evidenceId: string;
  }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, workpaperId, evidenceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "workpaper:write", meta);
    const input = await parseBody(request, deleteEvidenceSchema);
    const workpaper = await deleteEvidence(access, engagementId, workpaperId, evidenceId, input);

    return jsonOk(workpaper, meta);
  });
}
