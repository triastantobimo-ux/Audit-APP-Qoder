import { NextRequest } from "next/server";
import {
  jsonOk,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { closeCycle } from "@/server/risk-service";

type Params = {
  params: Promise<{ workspaceId: string; cycleId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId, cycleId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "cycle:write", meta);
    const cycle = await closeCycle(access, cycleId);

    return jsonOk(cycle, meta);
  });
}
