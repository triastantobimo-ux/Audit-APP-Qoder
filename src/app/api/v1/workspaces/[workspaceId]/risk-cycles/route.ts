import { NextRequest } from "next/server";
import { createCycleSchema } from "@/lib/schemas";
import {
  jsonOk,
  parseBody,
  requireWorkspaceAccess,
  withApi,
} from "@/server/api";
import { createCycle, listCycles } from "@/server/risk-service";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "cycle:read", meta);
    const cycles = await listCycles(access);

    return jsonOk(cycles, meta);
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;

  return withApi(request, async (meta) => {
    const access = await requireWorkspaceAccess(workspaceId, "cycle:write", meta);
    const input = await parseBody(request, createCycleSchema);
    const cycle = await createCycle(access, input);

    return jsonOk(cycle, meta, { status: 201 });
  });
}
