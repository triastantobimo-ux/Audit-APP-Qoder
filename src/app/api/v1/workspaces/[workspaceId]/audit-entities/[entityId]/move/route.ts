import { NextRequest } from "next/server";
import { moveEntitySchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { moveEntity } from "@/server/entity-service";

type Params = {
  params: Promise<{ workspaceId: string; entityId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, entityId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "entity:write", meta);
    const input = await parseBody(request, moveEntitySchema);
    const entity = await moveEntity(access, entityId, input);

    return jsonOk(entity, meta);
  });
}
