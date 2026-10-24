import { NextRequest } from "next/server";
import {
  jsonOk,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { getDashboardSummary } from "@/server/risk-service";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "ranking:read", meta);
    const cycleId = request.nextUrl.searchParams.get("cycleId") ?? undefined;
    const summary = await getDashboardSummary(access, cycleId);

    return jsonOk(summary, meta);
  });
}
