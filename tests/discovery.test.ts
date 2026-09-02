import { describe, expect, it } from "vitest";
import type { RawSignal } from "../src/domain/schemas.js";
import { DiscoveryService } from "../src/pipeline/discovery.js";
import { MemoryStore } from "../src/storage/memory-store.js";

const signal: RawSignal = {
  source: "working-source",
  sourceType: "rss",
  title: "A verifiable trend is moving quickly",
  summary: "Independent sources are discussing the same public event.",
  url: "https://example.com/trend",
  publishedAt: "2026-09-01T00:00:00.000Z",
  metrics: {},
  tags: ["trend"],
};

describe("discovery resilience", () => {
  it("isolates a failed source and preserves its identity", async () => {
    const store = new MemoryStore();
    const discovery = new DiscoveryService(store, [
      { id: "broken-source", fetch: async () => { throw new Error("upstream unavailable"); } },
      { id: "working-source", fetch: async () => [signal] },
    ]);

    const run = await discovery.run({ timeoutMs: 1_000, maxItems: 5 });

    expect(run.status).toBe("partial");
    expect(run.counters.inserted).toBe(1);
    expect(run.errors).toEqual([{ source: "broken-source", code: "SOURCE_FAILED", message: "upstream unavailable" }]);
  });

  it("returns a conflict when an unexpired discovery lease exists", async () => {
    const store = new MemoryStore();
    await store.transact((state) => {
      state.jobRuns.active = {
        id: "active",
        kind: "discover",
        status: "running",
        startedAt: "2026-09-01T00:00:00.000Z",
        counters: {},
        errors: [],
        leaseOwner: "another-worker",
        leaseExpiresAt: "2999-01-01T00:00:00.000Z",
      };
    });
    const discovery = new DiscoveryService(store, []);

    await expect(discovery.run({ timeoutMs: 1_000, maxItems: 5 })).rejects.toMatchObject({
      code: "JOB_ALREADY_RUNNING",
      statusCode: 409,
    });
  });
});
