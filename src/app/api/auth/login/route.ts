import { compare } from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/schemas";
import { ApiError } from "@/server/api-error";
import { jsonOk, parseBody, withApi } from "@/server/api";
import {
  SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
} from "@/server/auth";

export async function POST(request: NextRequest) {
  return withApi(request, async (meta) => {
    const input = await parseBody(request, loginSchema);

    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!user || !user.isActive) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email atau password salah");
    }

    const valid = await compare(input.password, user.passwordHash);

    if (!valid) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email atau password salah");
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      throw new ApiError(403, "NO_WORKSPACE", "User tidak memiliki workspace");
    }

    const session = await createSession(user.id);
    const response = jsonOk(
      {
        user: { id: user.id, email: user.email, name: user.name },
        workspace: {
          id: membership.workspace.id,
          name: membership.workspace.name,
          slug: membership.workspace.slug,
        },
        role: membership.role,
      },
      meta,
    );

    response.cookies.set(
      SESSION_COOKIE,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );

    return response;
  });
}
