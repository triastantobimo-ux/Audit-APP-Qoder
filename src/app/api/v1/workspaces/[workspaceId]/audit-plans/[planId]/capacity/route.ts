import { NextRequest } from "next/server";
import { replacePlanCapacitySchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { replacePlanCapacity } from "@/server/plan-service";

type Params = { params: Promise<{ workspaceId: string; planId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const { workspaceId, planId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "plan:write", meta);
    const input = await parseBody(request, replacePlanCapacitySchema);

    return jsonOk(await replacePlanCapacity(access, planId, input), meta);
  });
}
