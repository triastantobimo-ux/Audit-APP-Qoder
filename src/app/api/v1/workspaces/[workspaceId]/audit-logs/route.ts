import { NextRequest } from "next/server";
import {
  jsonOk,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { listAuditEvents } from "@/server/risk-service";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "auditLog:read", meta);
    const search = request.nextUrl.searchParams;
    const limit = Number(search.get("limit") ?? 100);

    const events = await listAuditEvents(access, {
      objectType: search.get("objectType") ?? undefined,
      objectId: search.get("objectId") ?? undefined,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 100,
    });

    return jsonOk(events, meta);
  });
}
