import { NextRequest } from "next/server";
import {
  jsonOk,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { getRankings } from "@/server/risk-service";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "ranking:read", meta);
    const search = request.nextUrl.searchParams;
    const levels =
      search
        .get("level")
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean) ?? undefined;
    const limit = Number(search.get("limit") ?? 50);

    const rankings = await getRankings(access, {
      cycleId: search.get("cycleId") ?? undefined,
      levels,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
    });

    return jsonOk(rankings, meta);
  });
}
