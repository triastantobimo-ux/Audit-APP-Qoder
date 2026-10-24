import { NextRequest } from "next/server";
import { findingStatuses, type FindingStatus } from "@/lib/finding";
import { ApiError } from "@/server/api-error";
import { jsonOk, requireWorkspaceAccess, withApi } from "@/server/api";
import { listRemediationRegister } from "@/server/finding-service";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "finding:read", meta);
    const search = request.nextUrl.searchParams;
    const scope = search.get("scope");
    const status = search.get("status");

    if (scope && scope !== "mine" && scope !== "all") {
      throw new ApiError(400, "INVALID_SCOPE", "Scope register harus mine atau all");
    }

    if (status && !findingStatuses.includes(status as FindingStatus)) {
      throw new ApiError(400, "INVALID_STATUS", `Status temuan tidak dikenal: ${status}`);
    }

    const register = await listRemediationRegister(access, {
      scope: scope === "all" ? "all" : "mine",
      status: status ? (status as FindingStatus) : undefined,
    });

    return jsonOk(register, meta);
  });
}
