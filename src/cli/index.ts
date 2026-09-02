import { loadConfig } from "../config/env.js";
import { verifyAuditChain } from "../domain/audit.js";
import type { RawSignal } from "../domain/schemas.js";
import { MemoryStore } from "../storage/memory-store.js";
import { createContext } from "../server/context.js";

const command = process.argv[2] ?? "help";

switch (command) {
  case "smoke": await smoke(); break;
  case "pipeline": await pipeline(); break;
  case "track": await track(); break;
  default:
    process.stdout.write("NOWLORE CLI\n\nCommands:\n  smoke      Run an offline end-to-end flow\n  pipeline   Run configured discovery/evaluation/design\n  track      Refresh launched projects\n");
}

async function smoke() {
  const config = loadConfig({
    NODE_ENV: "test",
    STORE_DRIVER: "memory",
    AI_PROTOCOL: "mock",
    ASSET_DRIVER: "local",
    ASSET_LOCAL_PATH: "./data/smoke-assets",
    ASSET_PUBLIC_BASE_URL: "http://localhost:8080/assets",
    CHAIN_MODE: "dry-run",
    SOLANA_NETWORK: "devnet",
    ADMIN_TOKEN: "smoke-admin-token",
    CRON_TOKEN: "smoke-cron-token",
  });
  const signal: RawSignal = {
    source: "smoke-polymarket",
    sourceType: "polymarket",
    externalId: "smoke-1",
    title: "Open source robots become the internet's newest obsession",
    summary: "Multiple technology communities are discussing a new open source robotics release.",
    url: "https://example.com/nowlore-smoke-signal",
    publishedAt: new Date().toISOString(),
    metrics: { volume24hr: 100_000_000, comments: 2_000 },
    tags: ["robotics", "open-source"],
  };
  const source = { id: "smoke-source", fetch: async () => [signal] };
  const context = await createContext(config, { store: new MemoryStore(), sources: [source] });
  try {
    const discovery = await context.discovery.run({ timeoutMs: 1_000, maxItems: 5, actorId: "smoke" });
    const state = await context.store.snapshot();
    const topic = Object.values(state.topics)[0];
    if (!topic) throw new Error("Smoke flow produced no topic");
    const assessment = await context.oracle.evaluate(topic.id, "smoke");
    if (assessment.recommendation !== "design") throw new Error(`Smoke assessment was ${assessment.recommendation}`);
    let project = await context.forge.design(topic.id, "smoke");
    project = await context.projects.review(project.id, "smoke");
    project = await context.projects.approve(project.id, project.contentHash, "Offline smoke approval", "smoke");
    project = await context.assets.publish(project.id, "smoke");
    const simulation = await context.launches.simulate(project.id, "smoke");
    const launch = await context.launches.launch(project.id, `smoke-${project.id}`, "smoke");
    const metric = await context.launches.refresh(project.id, "smoke");
    const finalState = await context.store.snapshot();
    const audit = verifyAuditChain(finalState.auditEvents);
    if (!audit.valid) throw new Error("Audit chain failed smoke verification");
    process.stdout.write(`${JSON.stringify({
      ok: true,
      discovery: discovery.counters,
      topic: { id: topic.id, score: topic.heuristicScore },
      assessment: assessment.recommendation,
      project: { id: project.id, symbol: project.symbol },
      simulation: simulation.status,
      launch: { status: launch.status, mint: launch.mint },
      metric: metric.transactionStatus,
      auditEvents: finalState.auditEvents.length,
    }, null, 2)}\n`);
  } finally {
    await context.store.close();
  }
}

async function pipeline() {
  const config = loadConfig();
  const context = await createContext(config);
  try {
    const result = await context.pipeline.run(5, true, "operator", "cli");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await context.store.close();
  }
}

async function track() {
  const config = loadConfig();
  const context = await createContext(config);
  try {
    const state = await context.store.snapshot();
    const results = [];
    for (const project of Object.values(state.projects).filter((item) => item.status === "launched")) {
      results.push(await context.launches.refresh(project.id, "cli"));
    }
    process.stdout.write(`${JSON.stringify({ refreshed: results.length, results }, null, 2)}\n`);
  } finally {
    await context.store.close();
  }
}
