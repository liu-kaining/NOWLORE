import { describe, expect, it } from "vitest";
import type { AssessmentOutput, Signal } from "../src/domain/schemas.js";
import { applyDeterministicEvidencePolicy } from "../src/pipeline/oracle.js";

const permissiveOutput: AssessmentOutput = {
  summary: "Looks timely",
  narrative: "An external model considered this suitable.",
  audience: ["internet culture"],
  supportingEvidence: ["sig_1"],
  counterEvidence: [],
  scores: { memeability: 90, timeliness: 90, verifiability: 80, originality: 80, controversy: 5, legal: 5, safety: 5, brand: 5 },
  expectedWindowHours: 24,
  confidence: 0.9,
  riskFlags: [],
  recommendation: "design",
};

function evidence(title: string): Signal {
  return {
    id: "sig_1", source: "test", sourceType: "rss", title, summary: "Public report", url: "https://example.com/evidence",
    publishedAt: "2026-09-01T00:00:00.000Z", observedAt: "2026-09-01T00:01:00.000Z", metrics: {}, tags: [], rawHash: "a".repeat(64),
  };
}

describe("deterministic evidence policy", () => {
  it.each(["Celebrity death becomes a trend", "Children affected by a disaster", "Presidential election controversy"])(
    "overrides an unsafe external-model decision for %s",
    (title) => {
      const result = applyDeterministicEvidencePolicy(permissiveOutput, [evidence(title)]);
      expect(result.recommendation).toBe("reject");
      expect(result.scores.safety).toBeGreaterThanOrEqual(95);
      expect(result.riskFlags[0]).toMatch(/^deterministic-block:/);
    },
  );

  it("leaves ordinary technology evidence unchanged", () => {
    expect(applyDeterministicEvidencePolicy(permissiveOutput, [evidence("Open source robotics toolkit released")])).toEqual(permissiveOutput);
  });
});
