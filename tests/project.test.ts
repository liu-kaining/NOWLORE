import { describe, expect, it } from "vitest";
import { AppError } from "../src/domain/errors.js";
import { assertProjectTransition, computeProjectContentHash } from "../src/domain/project.js";

describe("project state and content", () => {
  it("permits the documented happy-path transitions", () => {
    expect(() => assertProjectTransition("draft", "reviewed")).not.toThrow();
    expect(() => assertProjectTransition("reviewed", "approved")).not.toThrow();
    expect(() => assertProjectTransition("approved", "assets_published")).not.toThrow();
    expect(() => assertProjectTransition("assets_published", "simulated")).not.toThrow();
    expect(() => assertProjectTransition("simulated", "launching")).not.toThrow();
    expect(() => assertProjectTransition("launching", "launched")).not.toThrow();
  });

  it("blocks skipping approval", () => {
    expect(() => assertProjectTransition("draft", "launching")).toThrow(AppError);
  });

  it("changes content hash when a launch field changes", () => {
    const base = {
      name: "Moment Lore", symbol: "MOMENT", tagline: "Now", thesis: "Thesis", description: "Description",
      visualPrompt: "Poster", websiteCopy: "Copy", socialDrafts: ["Post"], riskDisclosures: ["Fast decay"],
      experimentWindowHours: 48, experimentStartsAt: new Date(0).toISOString(), experimentEndsAt: new Date(48 * 3_600_000).toISOString(),
      disclaimers: ["No promises"], network: "devnet" as const, quoteMint: "SOL", teamAllocation: "0", creatorInitialBuy: "0", signalIds: ["sig_1"],
    };
    expect(computeProjectContentHash(base)).not.toBe(computeProjectContentHash({ ...base, symbol: "OTHER" }));
  });
});
