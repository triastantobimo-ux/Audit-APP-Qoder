import { describe, expect, it } from "vitest";
import { can } from "./rbac";

describe("can", () => {
  it("allows CAE to manage and approve the audit universe", () => {
    expect(can("CAE", "entity:write")).toBe(true);
    expect(can("CAE", "entity:archive")).toBe(true);
    expect(can("CAE", "assessment:approve")).toBe(true);
    expect(can("CAE", "riskModel:activate")).toBe(true);
  });

  it("allows managers to write assessments and approve them", () => {
    expect(can("MANAGER", "entity:write")).toBe(true);
    expect(can("MANAGER", "assessment:write")).toBe(true);
    expect(can("MANAGER", "assessment:approve")).toBe(true);
  });

  it("allows auditors to write and submit assessments but not approve", () => {
    expect(can("AUDITOR", "assessment:write")).toBe(true);
    expect(can("AUDITOR", "assessment:submit")).toBe(true);
    expect(can("AUDITOR", "assessment:approve")).toBe(false);
  });

  it("keeps reviewers read-only on the universe", () => {
    expect(can("REVIEWER", "assessment:read")).toBe(true);
    expect(can("REVIEWER", "ranking:read")).toBe(true);
    expect(can("REVIEWER", "assessment:write")).toBe(false);
  });

  it("allows admins to configure risk models but not approve assessments", () => {
    expect(can("ADMIN", "riskModel:write")).toBe(true);
    expect(can("ADMIN", "auditLog:read")).toBe(true);
    expect(can("ADMIN", "assessment:approve")).toBe(false);
  });

  it("does not give process owners audit-universe capabilities in E01", () => {
    expect(can("PROCESS_OWNER", "entity:read")).toBe(false);
    expect(can("PROCESS_OWNER", "assessment:read")).toBe(false);
  });

  it("lets CAE manage and approve annual plans", () => {
    expect(can("CAE", "plan:read")).toBe(true);
    expect(can("CAE", "plan:write")).toBe(true);
    expect(can("CAE", "plan:approve")).toBe(true);
  });

  it("lets managers build plans but not approve them", () => {
    expect(can("MANAGER", "plan:read")).toBe(true);
    expect(can("MANAGER", "plan:write")).toBe(true);
    expect(can("MANAGER", "plan:approve")).toBe(false);
  });

  it("keeps auditors and reviewers read-only on plans", () => {
    expect(can("AUDITOR", "plan:read")).toBe(true);
    expect(can("AUDITOR", "plan:write")).toBe(false);
    expect(can("REVIEWER", "plan:read")).toBe(true);
    expect(can("REVIEWER", "plan:approve")).toBe(false);
  });

  it("lets admins approve plans as governance fallback but not edit them", () => {
    expect(can("ADMIN", "plan:read")).toBe(true);
    expect(can("ADMIN", "plan:approve")).toBe(true);
    expect(can("ADMIN", "plan:write")).toBe(false);
  });

  it("does not give process owners plan access", () => {
    expect(can("PROCESS_OWNER", "plan:read")).toBe(false);
  });

  it("lets CAE prepare, review, and issue engagements", () => {
    expect(can("CAE", "engagement:read")).toBe(true);
    expect(can("CAE", "engagement:write")).toBe(true);
    expect(can("CAE", "engagement:review")).toBe(true);
    expect(can("CAE", "engagement:issue")).toBe(true);
  });

  it("lets managers prepare and review engagements but not issue them", () => {
    expect(can("MANAGER", "engagement:read")).toBe(true);
    expect(can("MANAGER", "engagement:write")).toBe(true);
    expect(can("MANAGER", "engagement:review")).toBe(true);
    expect(can("MANAGER", "engagement:issue")).toBe(false);
  });

  it("lets auditors prepare but not review or issue engagements", () => {
    expect(can("AUDITOR", "engagement:write")).toBe(true);
    expect(can("AUDITOR", "engagement:review")).toBe(false);
    expect(can("AUDITOR", "engagement:issue")).toBe(false);
  });

  it("lets reviewers review but not prepare engagements", () => {
    expect(can("REVIEWER", "engagement:read")).toBe(true);
    expect(can("REVIEWER", "engagement:review")).toBe(true);
    expect(can("REVIEWER", "engagement:write")).toBe(false);
  });

  it("lets admins issue engagements as governance fallback", () => {
    expect(can("ADMIN", "engagement:read")).toBe(true);
    expect(can("ADMIN", "engagement:issue")).toBe(true);
    expect(can("ADMIN", "engagement:write")).toBe(false);
  });

  it("does not give process owners engagement access", () => {
    expect(can("PROCESS_OWNER", "engagement:read")).toBe(false);
  });

  it("lets auditors prepare workpapers but not review or sign them off", () => {
    expect(can("AUDITOR", "workpaper:read")).toBe(true);
    expect(can("AUDITOR", "workpaper:write")).toBe(true);
    expect(can("AUDITOR", "workpaper:review")).toBe(false);
    expect(can("AUDITOR", "workpaper:signoff")).toBe(false);
  });

  it("lets reviewers review and sign off workpapers but not prepare them", () => {
    expect(can("REVIEWER", "workpaper:read")).toBe(true);
    expect(can("REVIEWER", "workpaper:review")).toBe(true);
    expect(can("REVIEWER", "workpaper:signoff")).toBe(true);
    expect(can("REVIEWER", "workpaper:write")).toBe(false);
  });

  it("lets managers prepare, review, and sign off workpapers", () => {
    expect(can("MANAGER", "workpaper:write")).toBe(true);
    expect(can("MANAGER", "workpaper:review")).toBe(true);
    expect(can("MANAGER", "workpaper:signoff")).toBe(true);
  });

  it("lets CAE perform every workpaper action", () => {
    expect(can("CAE", "workpaper:read")).toBe(true);
    expect(can("CAE", "workpaper:write")).toBe(true);
    expect(can("CAE", "workpaper:review")).toBe(true);
    expect(can("CAE", "workpaper:signoff")).toBe(true);
  });

  it("keeps admins read-only on workpapers and excludes process owners", () => {
    expect(can("ADMIN", "workpaper:read")).toBe(true);
    expect(can("ADMIN", "workpaper:write")).toBe(false);
    expect(can("ADMIN", "workpaper:signoff")).toBe(false);
    expect(can("PROCESS_OWNER", "workpaper:read")).toBe(false);
  });

  it("lets CAE run the whole finding lifecycle", () => {
    expect(can("CAE", "finding:read")).toBe(true);
    expect(can("CAE", "finding:write")).toBe(true);
    expect(can("CAE", "finding:validate")).toBe(true);
    expect(can("CAE", "finding:acceptRisk")).toBe(true);
  });

  it("lets managers raise and validate findings but not accept residual risk", () => {
    expect(can("MANAGER", "finding:read")).toBe(true);
    expect(can("MANAGER", "finding:write")).toBe(true);
    expect(can("MANAGER", "finding:validate")).toBe(true);
    expect(can("MANAGER", "finding:acceptRisk")).toBe(false);
  });

  it("lets auditors raise findings but not close their own work", () => {
    expect(can("AUDITOR", "finding:read")).toBe(true);
    expect(can("AUDITOR", "finding:write")).toBe(true);
    expect(can("AUDITOR", "finding:validate")).toBe(false);
    expect(can("AUDITOR", "finding:acceptRisk")).toBe(false);
  });

  it("lets reviewers validate closure without editing the finding", () => {
    expect(can("REVIEWER", "finding:read")).toBe(true);
    expect(can("REVIEWER", "finding:validate")).toBe(true);
    expect(can("REVIEWER", "finding:write")).toBe(false);
  });

  it("gives process owners only their own remediation response rights", () => {
    expect(can("PROCESS_OWNER", "finding:read")).toBe(true);
    expect(can("PROCESS_OWNER", "finding:respond")).toBe(true);
    expect(can("PROCESS_OWNER", "finding:write")).toBe(false);
    expect(can("PROCESS_OWNER", "finding:validate")).toBe(false);
    expect(can("PROCESS_OWNER", "finding:acceptRisk")).toBe(false);
  });

  it("keeps admins out of finding content but allows risk acceptance", () => {
    expect(can("ADMIN", "finding:read")).toBe(true);
    expect(can("ADMIN", "finding:acceptRisk")).toBe(true);
    expect(can("ADMIN", "finding:write")).toBe(false);
    expect(can("ADMIN", "finding:validate")).toBe(false);
  });
});
