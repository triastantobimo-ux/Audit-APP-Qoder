import { NextRequest } from "next/server";
import { archiveEntitySchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { archiveEntity } from "@/server/entity-service";

type Params = {
  params: Promise<{ workspaceId: string; entityId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, entityId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "entity:archive",
      meta,
    );
    const input = await parseBody(request, archiveEntitySchema);
    const entity = await archiveEntity(access, entityId, input.version);

    return jsonOk(entity, meta);
  });
}
