import { NextRequest } from "next/server";
import { updateEntitySchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { getEntity, updateEntity } from "@/server/entity-service";

type Params = {
  params: Promise<{ workspaceId: string; entityId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, entityId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "entity:read", meta);
    const entity = await getEntity(access, entityId);

    return jsonOk(entity, meta);
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { workspaceId, entityId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "entity:write", meta);
    const input = await parseBody(request, updateEntitySchema);
    const entity = await updateEntity(access, entityId, input);

    return jsonOk(entity, meta);
  });
}
