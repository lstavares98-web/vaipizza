import { describe, expect, it } from "vitest";
import { hashToken, generateOpaqueToken } from "./tokens.js";

describe("opaque refresh tokens", () => {
  it("generates unique, sufficiently long tokens", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(64);
  });

  it("hashes deterministically so lookups by hash work", () => {
    const token = "abc123";
    expect(hashToken(token)).toEqual(hashToken(token));
    expect(hashToken(token)).not.toEqual(token);
  });
});
