import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  it("matches the published digest for a known input", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is stable across identical buffers", () => {
    const a = sha256Hex(Buffer.from("bukti\n"));
    const b = sha256Hex(Buffer.from("bukti\n"));

    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
