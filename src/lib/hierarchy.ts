export class HierarchyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HierarchyError";
  }
}

export function normalizeEntityCode(code: string): string {
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new HierarchyError("EMPTY_CODE", "Entity code is required");
  }

  return normalized;
}

export function wouldCreateCycle(
  entityId: string,
  newParentId: string | null,
  parentById: Map<string, string | null>,
): boolean {
  if (!newParentId) {
    return false;
  }

  if (newParentId === entityId) {
    return true;
  }

  if (!parentById.has(newParentId)) {
    throw new HierarchyError("PARENT_NOT_FOUND", "Parent entity was not found");
  }

  let current: string | null = newParentId;
  const visited = new Set<string>();

  while (current) {
    if (current === entityId) {
      return true;
    }

    if (visited.has(current)) {
      throw new HierarchyError("CORRUPT_HIERARCHY", "Existing hierarchy has a cycle");
    }

    visited.add(current);

    if (!parentById.has(current)) {
      throw new HierarchyError(
        "PARENT_NOT_FOUND",
        "An ancestor entity was not found",
      );
    }

    current = parentById.get(current) ?? null;
  }

  return false;
}

export function computeDepth(parentDepth: number | null): number {
  return parentDepth === null ? 0 : parentDepth + 1;
}

export function canArchiveEntity(activeChildCount: number): boolean {
  return activeChildCount === 0;
}
