import { describe, expect, it } from "vitest";
import { canonicalJson, sha256 } from "../src/lib/hash.js";
import { normalizeUrl } from "../src/lib/text.js";

describe("canonical hashing", () => {
  it("is stable across object key order", () => {
    expect(canonicalJson({ b: 2, a: { y: 2, x: 1 } })).toBe(canonicalJson({ a: { x: 1, y: 2 }, b: 2 }));
    expect(sha256({ b: 2, a: 1 })).toBe(sha256({ a: 1, b: 2 }));
  });

  it("normalizes tracking parameters", () => {
    expect(normalizeUrl("https://EXAMPLE.com/story/?utm_source=x&b=2&a=1#section")).toBe("https://example.com/story?a=1&b=2");
  });
});
