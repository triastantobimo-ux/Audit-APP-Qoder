import { describe, expect, it } from "vitest";
import {
  HierarchyError,
  canArchiveEntity,
  computeDepth,
  normalizeEntityCode,
  wouldCreateCycle,
} from "./hierarchy";

const parents = new Map<string, string | null>([
  ["root", null],
  ["finance", "root"],
  ["ap", "finance"],
  ["it", "root"],
]);

describe("normalizeEntityCode", () => {
  it("trims, uppercases, and slugifies a code", () => {
    expect(normalizeEntityCode("  procure to pay  ")).toBe("PROCURE-TO-PAY");
  });

  it("rejects an empty code", () => {
    expect(() => normalizeEntityCode("   ")).toThrow(HierarchyError);
  });
});

describe("wouldCreateCycle", () => {
  it("rejects moving an entity under itself", () => {
    expect(wouldCreateCycle("finance", "finance", parents)).toBe(true);
  });

  it("rejects moving a parent under its descendant", () => {
    expect(wouldCreateCycle("finance", "ap", parents)).toBe(true);
  });

  it("allows moving an entity to an unrelated branch", () => {
    expect(wouldCreateCycle("it", "finance", parents)).toBe(false);
  });

  it("allows moving an entity to the root", () => {
    expect(wouldCreateCycle("finance", null, parents)).toBe(false);
  });

  it("rejects an unknown parent", () => {
    expect(() => wouldCreateCycle("finance", "missing", parents)).toThrow(
      HierarchyError,
    );
  });
});

describe("computeDepth", () => {
  it("returns zero for roots", () => {
    expect(computeDepth(null)).toBe(0);
  });

  it("increments the parent depth", () => {
    expect(computeDepth(2)).toBe(3);
  });
});

describe("canArchiveEntity", () => {
  it("allows archiving a leaf", () => {
    expect(canArchiveEntity(0)).toBe(true);
  });

  it("blocks archiving a parent with active children", () => {
    expect(canArchiveEntity(2)).toBe(false);
  });
});
