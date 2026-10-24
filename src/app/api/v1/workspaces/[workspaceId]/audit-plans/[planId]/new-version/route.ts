import { NextRequest } from "next/server";
import { newPlanVersionSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { createPlanVersion } from "@/server/plan-service";

type Params = { params: Promise<{ workspaceId: string; planId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, planId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "plan:write", meta);
    const input = await parseBody(request, newPlanVersionSchema);

    return jsonOk(
      await createPlanVersion(access, planId, input),
      meta,
      { status: 201 },
    );
  });
}
