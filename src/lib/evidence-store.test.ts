import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EvidenceStoreError,
  putEvidence,
  readEvidence,
  storageKeyFor,
} from "./evidence-store";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "auditflow-evidence-"));
  process.env.EVIDENCE_DIR = dir;
});

afterEach(async () => {
  delete process.env.EVIDENCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function expectStoreError(fn: () => Promise<unknown>, code: string) {
  return fn().then(
    () => {
      throw new Error("expected promise to reject");
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(EvidenceStoreError);
      expect((error as EvidenceStoreError).code).toBe(code);
    },
  );
}

describe("storageKeyFor", () => {
  it("builds a readable per-version key", () => {
    expect(
      storageKeyFor({
        workspaceId: "ws_demo",
        engagementId: "eng_1",
        workpaperId: "wp_1",
        version: 2,
        fileName: "../../approval matrix.csv",
      }),
    ).toBe("ws_demo/eng_1/wp_1/v2-approval_matrix.csv");
  });
});

describe("putEvidence", () => {
  it("stores the bytes and reports the digest and size", async () => {
    const key = storageKeyFor({
      workspaceId: "ws_demo",
      engagementId: "eng_1",
      workpaperId: "wp_1",
      version: 1,
      fileName: "matriks.csv",
    });
    const content = Buffer.from("vendor,approval\n1001,bima\n");

    const stored = await putEvidence(key, content);

    expect(stored.sizeBytes).toBe(content.byteLength);
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await readEvidence(key)).toString("utf8")).toBe("vendor,approval\n1001,bima\n");
  });

  it("refuses a key that points outside the evidence root", () => {
    return expectStoreError(() => putEvidence("../escape.txt", Buffer.from("x")), "EVIDENCE_KEY_UNSAFE");
  });

  it("reports a missing file instead of an empty buffer", () => {
    return expectStoreError(
      () => readEvidence("ws_demo/eng_1/wp_1/v1-absent.txt"),
      "EVIDENCE_NOT_FOUND",
    );
  });
});
