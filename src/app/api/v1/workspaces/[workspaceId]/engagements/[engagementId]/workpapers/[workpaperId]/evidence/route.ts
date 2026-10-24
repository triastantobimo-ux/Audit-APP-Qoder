import { NextRequest } from "next/server";
import { uploadEvidenceSchema } from "@/lib/schemas";
import { ApiError } from "@/server/api-error";
import { jsonOk, requireWorkspaceAccess, withApi } from "@/server/api";
import { uploadEvidence } from "@/server/workpaper-service";

type Params = {
  params: Promise<{ workspaceId: string; engagementId: string; workpaperId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, workpaperId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "workpaper:write", meta);
    const form = await request.formData().catch(() => null);

    if (!form) {
      throw new ApiError(400, "INVALID_FORM", "Permintaan harus berupa multipart/form-data");
    }

    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new ApiError(422, "FILE_REQUIRED", "File evidence wajib diunggah");
    }

    const input = uploadEvidenceSchema.parse({
      label: form.get("label"),
      source: form.get("source"),
      periodLabel: form.get("periodLabel") || null,
      capturedAt: form.get("capturedAt"),
      rcmRowId: form.get("rcmRowId") || null,
      supersedesId: form.get("supersedesId") || null,
    });

    const bytes = Buffer.from(await file.arrayBuffer());
    const workpaper = await uploadEvidence(
      access,
      engagementId,
      workpaperId,
      input,
      { name: file.name, type: file.type || "application/octet-stream", bytes },
    );

    return jsonOk(workpaper, meta, { status: 201 });
  });
}
