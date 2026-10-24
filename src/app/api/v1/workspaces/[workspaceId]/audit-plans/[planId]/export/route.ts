import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceAccess, withApi } from "@/server/api";
import { exportPlanCsv } from "@/server/plan-service";

type Params = { params: Promise<{ workspaceId: string; planId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, planId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "plan:read", meta);
    const { csv, filename } = await exportPlanCsv(access, planId);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
