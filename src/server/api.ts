import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { can, isRole, type Capability, type Role } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { ApiError } from "./api-error";
import { getAuthUser, type AuthUser } from "./auth";

export type RequestMeta = {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
};

export type WorkspaceAccess = {
  user: AuthUser;
  workspace: { id: string; name: string; slug: string };
  membership: { id: string; role: Role };
  meta: RequestMeta;
};

export function getRequestMeta(request: NextRequest): RequestMeta {
  return {
    requestId: request.headers.get("x-request-id") ?? randomUUID(),
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  };
}

export function jsonOk(
  data: unknown,
  meta: RequestMeta,
  init?: ResponseInit,
): NextResponse {
  return NextResponse.json(
    { data, meta: { requestId: meta.requestId } },
    init,
  );
}

export function jsonError(
  error: ApiError | Error,
  meta: RequestMeta,
): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        type: `https://auditflow.local/errors/${error.code.toLowerCase()}`,
        title: error.message,
        status: error.status,
        code: error.code,
        detail: error.message,
        errors: error.details ?? undefined,
        requestId: meta.requestId,
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        type: "https://auditflow.local/errors/validation",
        title: "Validation failed",
        status: 422,
        code: "VALIDATION_ERROR",
        detail: "Request body or query is invalid",
        errors: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
        requestId: meta.requestId,
      },
      { status: 422 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return jsonError(
        new ApiError(409, "DUPLICATE_RECORD", "A record with this key already exists"),
        meta,
      );
    }

    if (error.code === "P2025") {
      return jsonError(
        new ApiError(404, "NOT_FOUND", "The requested record was not found"),
        meta,
      );
    }

    if (error.code === "P2003") {
      return jsonError(
        new ApiError(409, "RELATION_CONFLICT", "The operation conflicts with related data"),
        meta,
      );
    }
  }

  if (error instanceof SyntaxError) {
    return jsonError(
      new ApiError(400, "INVALID_JSON", "Request body must be valid JSON"),
      meta,
    );
  }

  console.error(error);

  return NextResponse.json(
    {
      type: "https://auditflow.local/errors/internal",
      title: "Internal server error",
      status: 500,
      code: "INTERNAL_ERROR",
      detail: "An unexpected error occurred",
      requestId: meta.requestId,
    },
    { status: 500 },
  );
}

export async function withApi(
  request: NextRequest,
  handler: (meta: RequestMeta) => Promise<NextResponse>,
): Promise<NextResponse> {
  const meta = getRequestMeta(request);

  try {
    assertSameOrigin(request);
    const response = await handler(meta);
    response.headers.set("x-request-id", meta.requestId);
    return response;
  } catch (error) {
    const response = jsonError(error as Error, meta);
    response.headers.set("x-request-id", meta.requestId);
    return response;
  }
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return;
  }

  const host = request.headers.get("host");

  try {
    if (!host || new URL(origin).host !== host) {
      throw new ApiError(403, "INVALID_ORIGIN", "Origin is not allowed");
    }
  } catch {
    throw new ApiError(403, "INVALID_ORIGIN", "Origin is not allowed");
  }
}

export async function parseBody<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  const body = await request.json().catch(() => null);

  if (!body) {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  return schema.parse(body);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getAuthUser();

  if (!user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required");
  }

  return user;
}

export async function requireWorkspace(
  user: AuthUser,
  workspaceId: string,
  capability?: Capability,
  meta?: RequestMeta,
): Promise<WorkspaceAccess> {
  const membership = await prisma.membership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id,
      },
    },
    include: { workspace: true },
  });

  if (!membership || !isRole(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to this workspace");
  }

  if (capability && !can(membership.role, capability)) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      `Role ${membership.role} cannot perform ${capability}`,
    );
  }

  return {
    user,
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
    },
    membership: {
      id: membership.id,
      role: membership.role,
    },
    meta: meta ?? {
      requestId: randomUUID(),
      ip: null,
      userAgent: null,
    },
  };
}

export async function requireWorkspaceAccess(
  workspaceId: string,
  capability?: Capability,
  meta?: RequestMeta,
): Promise<WorkspaceAccess> {
  const user = await requireUser();
  return requireWorkspace(user, workspaceId, capability, meta);
}
