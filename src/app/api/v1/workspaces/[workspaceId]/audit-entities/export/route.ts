import { NextRequest, NextResponse } from "next/server";
import { parseUniverseQuery } from "@/lib/universe-table";
import { requireWorkspaceAccess, withApi } from "@/server/api";
import { exportUniverseCsv } from "@/server/entity-service";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "entity:read", meta);
    const search = request.nextUrl.searchParams;
    const query = parseUniverseQuery((key) => search.get(key));

    const { csv, filename } = await exportUniverseCsv(
      access,
      {
        ...query.filters,
        riskLevel: query.filters.riskLevel ? [query.filters.riskLevel] : undefined,
      },
      { key: query.sortKey, dir: query.sortDir },
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
