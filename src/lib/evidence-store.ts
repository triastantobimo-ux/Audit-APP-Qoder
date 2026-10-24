import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { sha256Hex } from "./hash";
import { safeEvidenceFileName } from "./workpaper";

export class EvidenceStoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EvidenceStoreError";
  }
}

function evidenceRoot(): string {
  return resolve(process.env.EVIDENCE_DIR ?? ".evidence");
}

function absoluteKey(key: string): string {
  const root = evidenceRoot();
  const target = resolve(root, key.replace(/^[/\\]+/, ""));

  if (target !== root && !target.startsWith(root + sep)) {
    throw new EvidenceStoreError(
      "EVIDENCE_KEY_UNSAFE",
      "Lokasi penyimpanan evidence tidak valid.",
    );
  }
  return target;
}

export function storageKeyFor(input: {
  workspaceId: string;
  engagementId: string;
  workpaperId: string;
  version: number;
  fileName: string;
}): string {
  return `${input.workspaceId}/${input.engagementId}/${input.workpaperId}/v${input.version}-${safeEvidenceFileName(
    input.fileName,
  )}`;
}

export async function putEvidence(
  key: string,
  content: Buffer,
): Promise<{ sha256: string; sizeBytes: number }> {
  const target = absoluteKey(key);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);

  return { sha256: sha256Hex(content), sizeBytes: content.byteLength };
}

export async function readEvidence(key: string): Promise<Buffer> {
  const target = absoluteKey(key);
  try {
    return await readFile(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new EvidenceStoreError(
        "EVIDENCE_NOT_FOUND",
        "File evidence tidak ditemukan di penyimpanan.",
      );
    }
    throw error;
  }
}
