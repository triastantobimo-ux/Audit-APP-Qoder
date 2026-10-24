export type Role =
  | "ADMIN"
  | "CAE"
  | "MANAGER"
  | "AUDITOR"
  | "REVIEWER"
  | "PROCESS_OWNER";

export type Capability =
  | "entity:read"
  | "entity:write"
  | "entity:archive"
  | "riskModel:read"
  | "riskModel:write"
  | "riskModel:activate"
  | "cycle:read"
  | "cycle:write"
  | "assessment:read"
  | "assessment:write"
  | "assessment:submit"
  | "assessment:approve"
  | "plan:read"
  | "plan:write"
  | "plan:approve"
  | "engagement:read"
  | "engagement:write"
  | "engagement:review"
  | "engagement:issue"
  | "workpaper:read"
  | "workpaper:write"
  | "workpaper:review"
  | "workpaper:signoff"
  | "finding:read"
  | "finding:write"
  | "finding:respond"
  | "finding:validate"
  | "finding:acceptRisk"
  | "ranking:read"
  | "auditLog:read";

const capabilitiesByRole: Record<Role, ReadonlySet<Capability>> = {
  ADMIN: new Set<Capability>([
    "entity:read",
    "riskModel:read",
    "riskModel:write",
    "cycle:read",
    "cycle:write",
    "assessment:read",
    "plan:read",
    "plan:approve",
    "engagement:read",
    "engagement:issue",
    "workpaper:read",
    "finding:read",
    "finding:acceptRisk",
    "ranking:read",
    "auditLog:read",
  ]),
  CAE: new Set<Capability>([
    "entity:read",
    "entity:write",
    "entity:archive",
    "riskModel:read",
    "riskModel:write",
    "riskModel:activate",
    "cycle:read",
    "cycle:write",
    "assessment:read",
    "assessment:write",
    "assessment:submit",
    "assessment:approve",
    "plan:read",
    "plan:write",
    "plan:approve",
    "engagement:read",
    "engagement:write",
    "engagement:review",
    "engagement:issue",
    "workpaper:read",
    "workpaper:write",
    "workpaper:review",
    "workpaper:signoff",
    "finding:read",
    "finding:write",
    "finding:validate",
    "finding:acceptRisk",
    "ranking:read",
    "auditLog:read",
  ]),
  MANAGER: new Set<Capability>([
    "entity:read",
    "entity:write",
    "entity:archive",
    "riskModel:read",
    "cycle:read",
    "assessment:read",
    "assessment:write",
    "assessment:submit",
    "assessment:approve",
    "plan:read",
    "plan:write",
    "engagement:read",
    "engagement:write",
    "engagement:review",
    "workpaper:read",
    "workpaper:write",
    "workpaper:review",
    "workpaper:signoff",
    "finding:read",
    "finding:write",
    "finding:validate",
    "ranking:read",
  ]),
  AUDITOR: new Set<Capability>([
    "entity:read",
    "riskModel:read",
    "cycle:read",
    "assessment:read",
    "assessment:write",
    "assessment:submit",
    "plan:read",
    "engagement:read",
    "engagement:write",
    "workpaper:read",
    "workpaper:write",
    "finding:read",
    "finding:write",
    "ranking:read",
  ]),
  REVIEWER: new Set<Capability>([
    "entity:read",
    "riskModel:read",
    "cycle:read",
    "assessment:read",
    "plan:read",
    "engagement:read",
    "engagement:review",
    "workpaper:read",
    "workpaper:review",
    "workpaper:signoff",
    "finding:read",
    "finding:validate",
    "ranking:read",
  ]),
  PROCESS_OWNER: new Set<Capability>(["finding:read", "finding:respond"]),
};

export const roleLabels: Record<Role, string> = {
  ADMIN: "Administrator",
  CAE: "Kepala Audit Intern",
  MANAGER: "Audit Manager",
  AUDITOR: "Auditor",
  REVIEWER: "Reviewer / QA",
  PROCESS_OWNER: "Process Owner",
};

export function isRole(value: string): value is Role {
  return value in capabilitiesByRole;
}

export function can(role: Role, capability: Capability): boolean {
  return capabilitiesByRole[role].has(capability);
}
