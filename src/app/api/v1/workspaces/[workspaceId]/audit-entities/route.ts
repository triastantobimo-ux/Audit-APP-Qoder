import { NextRequest } from "next/server";
import { createEntitySchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { createEntity, listEntities } from "@/server/entity-service";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "entity:read", meta);
    const search = request.nextUrl.searchParams;
    const parentId = search.get("parentId");
    const assessmentState = search.get("assessmentState");
    const depth = search.get("depth");

    const entities = await listEntities(access, {
      q: search.get("q") ?? undefined,
      type: search.get("type") ?? undefined,
      status: search.get("status") ?? undefined,
      parentId: parentId === "null" ? null : parentId ?? undefined,
      ownerUserId: search.get("ownerUserId") ?? undefined,
      depth: depth && Number.isFinite(Number(depth))
        ? Number(depth)
        : undefined,
      assessmentState:
        assessmentState === "approved" ||
        assessmentState === "pending" ||
        assessmentState === "none"
          ? assessmentState
          : undefined,
      riskLevel:
        search
          .get("riskLevel")
          ?.split(",")
          .map((value) => value.trim())
          .filter(Boolean) ?? undefined,
      includeArchived: search.get("includeArchived") === "true",
    });

    return jsonOk(entities, meta);
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "entity:write", meta);
    const input = await parseBody(request, createEntitySchema);
    const entity = await createEntity(access, input);

    return jsonOk(entity, meta, { status: 201 });
  });
}
