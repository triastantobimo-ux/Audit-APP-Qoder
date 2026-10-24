import { NextRequest } from "next/server";
import { jsonOk, withApi } from "@/server/api";
import {
  SESSION_COOKIE,
  destroySession,
  getSessionToken,
  sessionCookieOptions,
} from "@/server/auth";

export async function POST(request: NextRequest) {
  return withApi(request, async (meta) => {
    const token = await getSessionToken();

    if (token) {
      await destroySession(token);
    }

    const response = jsonOk({ success: true }, meta);
    response.cookies.set(SESSION_COOKIE, "", {
      ...sessionCookieOptions(new Date(0)),
      maxAge: 0,
    });

    return response;
  });
}
