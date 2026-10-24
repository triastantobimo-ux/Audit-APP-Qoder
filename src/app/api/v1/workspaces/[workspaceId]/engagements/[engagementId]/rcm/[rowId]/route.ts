import { NextRequest } from "next/server";
import { deleteRcmRowSchema, updateRcmRowSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import {
  deleteRcmRow,
  updateRcmRow,
} from "@/server/engagement-service";

type Params = {
  params: Promise<{
    workspaceId: string;
    engagementId: string;
    rowId: string;
  }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, rowId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "engagement:write",
      meta,
    );
    const input = await parseBody(request, updateRcmRowSchema);
    const engagement = await updateRcmRow(
      access,
      engagementId,
      rowId,
      input,
    );

    return jsonOk(engagement, meta);
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { workspaceId, engagementId, rowId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "engagement:write",
      meta,
    );
    const input = await parseBody(request, deleteRcmRowSchema);
    const engagement = await deleteRcmRow(
      access,
      engagementId,
      rowId,
      input.version,
    );

    return jsonOk(engagement, meta);
  });
}
