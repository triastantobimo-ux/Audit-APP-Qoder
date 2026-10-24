import { Prisma } from "@prisma/client";

type AuditWriter = {
  auditEvent: {
    create: (args: Prisma.AuditEventCreateArgs) => Promise<unknown>;
  };
};

export type AuditEventInput = {
  workspaceId: string;
  actorId?: string | null;
  action: string;
  objectType: string;
  objectId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function recordAudit(
  client: AuditWriter,
  input: AuditEventInput,
): Promise<void> {
  await client.auditEvent.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      objectType: input.objectType,
      objectId: input.objectId,
      before: input.before === undefined ? null : JSON.stringify(input.before),
      after: input.after === undefined ? null : JSON.stringify(input.after),
      requestId: input.requestId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
