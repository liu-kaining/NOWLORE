import { describe, expect, it } from "vitest";
import type { ChainAdapter } from "../src/chain/types.js";
import { loadConfig } from "../src/config/env.js";
import { verifyAuditChain } from "../src/domain/audit.js";
import { AppError } from "../src/domain/errors.js";
import type { RawSignal } from "../src/domain/schemas.js";
import { createContext } from "../src/server/context.js";
import { MemoryStore } from "../src/storage/memory-store.js";

describe("offline workflow", () => {
  it("runs discovery through idempotent dry-run launch", async () => {
    const config = loadConfig({ NODE_ENV: "test", STORE_DRIVER: "memory", AI_PROTOCOL: "mock", ASSET_DRIVER: "local", ASSET_LOCAL_PATH: "./data/test-assets", ASSET_PUBLIC_BASE_URL: "http://localhost:8080/assets", CHAIN_MODE: "dry-run", SOLANA_NETWORK: "devnet", ADMIN_TOKEN: "test-admin-token", CRON_TOKEN: "test-cron-token" });
    const signal: RawSignal = {
      source: "test", sourceType: "polymarket", title: "Robots take over the internet conversation", summary: "A verified open source robotics release is trending.",
      url: "https://example.com/robot-trend", publishedAt: new Date().toISOString(), metrics: { volume24hr: 50_000_000 }, tags: ["robotics"],
    };
    const context = await createContext(config, { store: new MemoryStore(), sources: [{ id: "test", fetch: async () => [signal] }] });
    const first = await context.discovery.run({ timeoutMs: 1_000, maxItems: 5 });
    const second = await context.discovery.run({ timeoutMs: 1_000, maxItems: 5 });
    expect(first.counters.inserted).toBe(1);
    expect(second.counters.inserted).toBe(0);
    const topic = Object.values((await context.store.snapshot()).topics)[0]!;
    const assessment = await context.oracle.evaluate(topic.id);
    expect(assessment.recommendation).toBe("design");
    let project = await context.forge.design(topic.id);
    project = await context.projects.review(project.id, "tester");
    project = await context.projects.approve(project.id, project.contentHash, "Reviewed", "tester");
    project = await context.assets.publish(project.id, "tester");
    await context.launches.simulate(project.id, "tester");
    const firstLaunch = await context.launches.launch(project.id, "same-idempotency-key", "tester");
    const replay = await context.launches.launch(project.id, "same-idempotency-key", "tester");
    expect(replay.id).toBe(firstLaunch.id);
    expect(firstLaunch.status).toBe("confirmed");
    const state = await context.store.snapshot();
    expect(Object.values(state.projects)[0]!.status).toBe("launched");
    expect(verifyAuditChain(state.auditEvents).valid).toBe(true);
    await context.store.close();
  });

  it("never resubmits an ambiguous chain transaction and reconciles it by signature", async () => {
    let launchCalls = 0;
    const chain: ChainAdapter = {
      name: "delayed-confirmation",
      creatorWallet: () => "creator-wallet",
      simulate: async () => {
        const now = new Date();
        return {
          ok: true,
          simulatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 600_000).toISOString(),
          logs: ["simulation ok"],
          mint: "mint-address",
        };
      },
      launch: async () => {
        launchCalls += 1;
        throw new AppError("SOLANA_SUBMISSION_UNKNOWN", "submission outcome unknown", 503, { transactionSignature: "known-signature" });
      },
      refresh: async () => ({
        transactionStatus: "confirmed",
        creatorWalletLamports: "1",
        creatorVaultLamports: "2",
        collectedCreatorFeesLamports: "0",
      }),
    };
    const config = loadConfig({ NODE_ENV: "test", STORE_DRIVER: "memory", AI_PROTOCOL: "mock", ASSET_DRIVER: "local", ASSET_LOCAL_PATH: "./data/test-assets-delayed", ASSET_PUBLIC_BASE_URL: "http://localhost:8080/assets", CHAIN_MODE: "dry-run", SOLANA_NETWORK: "devnet", ADMIN_TOKEN: "test-admin-token", CRON_TOKEN: "test-cron-token" });
    const signal: RawSignal = {
      source: "test", sourceType: "rss", title: "A new robot trend spreads across developer communities", summary: "A verifiable release is gathering attention.",
      url: "https://example.com/delayed-trend", publishedAt: new Date().toISOString(), metrics: { comments: 5_000 }, tags: ["robotics"],
    };
    const context = await createContext(config, { store: new MemoryStore(), sources: [{ id: "test", fetch: async () => [signal] }], chain });
    await context.discovery.run({ timeoutMs: 1_000, maxItems: 5 });
    const topic = Object.values((await context.store.snapshot()).topics)[0]!;
    await context.oracle.evaluate(topic.id);
    let project = await context.forge.design(topic.id);
    project = await context.projects.review(project.id, "tester");
    project = await context.projects.approve(project.id, project.contentHash, "Reviewed", "tester");
    project = await context.assets.publish(project.id, "tester");
    await context.launches.simulate(project.id, "tester");

    await expect(context.launches.launch(project.id, "ambiguous-submit-key", "tester")).rejects.toMatchObject({ code: "SOLANA_SUBMISSION_UNKNOWN" });
    const replay = await context.launches.launch(project.id, "ambiguous-submit-key", "tester");
    expect(replay.status).toBe("submitted");
    expect(replay.transactionSignature).toBe("known-signature");
    expect(launchCalls).toBe(1);
    expect((await context.store.snapshot()).projects[project.id]!.status).toBe("launching");

    await context.launches.refresh(project.id, "tracker");
    const state = await context.store.snapshot();
    expect(state.projects[project.id]!.status).toBe("launched");
    expect(state.projects[project.id]!.publishedAt).toBeTruthy();
    expect(state.launches[replay.id]!.status).toBe("confirmed");
    expect(state.auditEvents.some((event) => event.action === "project.launched" && event.details.reconciledBy === "tracker")).toBe(true);
    await context.store.close();
  });
});
