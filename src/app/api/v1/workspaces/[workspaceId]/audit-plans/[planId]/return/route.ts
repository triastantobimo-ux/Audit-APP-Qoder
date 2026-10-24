import { NextRequest } from "next/server";
import { reviewActionSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { returnPlan } from "@/server/plan-service";

type Params = { params: Promise<{ workspaceId: string; planId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, planId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(
      workspaceId,
      "plan:approve",
      meta,
    );
    const input = await parseBody(request, reviewActionSchema);

    return jsonOk(
      await returnPlan(
        access,
        planId,
        input.version,
        input.comment ?? "",
      ),
      meta,
    );
  });
}
