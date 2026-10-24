import { NextRequest } from "next/server";
import { ApiError } from "@/server/api-error";
import { jsonOk, withApi } from "@/server/api";
import { getPageAuth } from "@/server/auth";

export async function GET(request: NextRequest) {
  return withApi(request, async (meta) => {
    const auth = await getPageAuth();

    if (!auth) {
      throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required");
    }

    return jsonOk(auth, meta);
  });
}
