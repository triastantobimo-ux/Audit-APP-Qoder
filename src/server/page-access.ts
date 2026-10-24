import type { PageAuth } from "./auth";
import type { WorkspaceAccess } from "./api";

export function toWorkspaceAccess(auth: PageAuth): WorkspaceAccess {
  return {
    user: auth.user,
    workspace: auth.workspace,
    membership: auth.membership,
    meta: {
      requestId: "server-render",
      ip: null,
      userAgent: null,
    },
  };
}
