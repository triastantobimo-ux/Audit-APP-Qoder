import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireWorkspaceAccess, withApi } from "@/server/api";
import { downloadEvidence } from "@/server/workpaper-service";

type Params = {
  params: Promise<{
    workspaceId: string;
    engagementId: string;
    workpaperId: string;
    evidenceId: string;
  }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, evidenceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "workpaper:read", meta);
    const file = await downloadEvidence(access, engagementId, evidenceId);
    const dispositionName = encodeURIComponent(file.fileName);

    return new NextResponse(new Uint8Array(file.content), {
      status: 200,
      headers: {
        "content-type": file.mimeType,
        "content-disposition": `attachment; filename="${dispositionName}"; filename*=UTF-8''${dispositionName}`,
        "content-length": String(file.content.byteLength),
        "cache-control": "private, no-store",
        "x-request-id": meta.requestId,
      },
    });
  });
}
