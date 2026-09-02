import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../src/config/env.js";
import { buildApp } from "../src/server/app.js";
import { MemoryStore } from "../src/storage/memory-store.js";

let app: FastifyInstance | undefined;
afterEach(async () => { if (app) await app.close(); app = undefined; });

describe("HTTP API", () => {
  it("separates public and admin routes", async () => {
    const config = loadConfig({ NODE_ENV: "test", STORE_DRIVER: "memory", AI_PROTOCOL: "mock", ASSET_DRIVER: "local", ASSET_LOCAL_PATH: "./data/test-http-assets", ASSET_PUBLIC_BASE_URL: "http://localhost:8080/assets", CHAIN_MODE: "dry-run", ADMIN_TOKEN: "test-admin-token", CRON_TOKEN: "test-cron-token" });
    const built = await buildApp(config, { store: new MemoryStore(), sources: [] });
    app = built.app;
    const health = await app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    expect(health.headers["content-security-policy"]).toContain("default-src 'self'");
    expect((await app.inject({ method: "GET", url: "/api/admin/overview" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/admin/overview", headers: { authorization: "Bearer test-admin-token" } })).statusCode).toBe(200);
    const manual = await app.inject({
      method: "POST", url: "/api/admin/signals", headers: { authorization: "Bearer test-admin-token" },
      payload: { title: "Manual public signal", summary: "Evidence", url: "https://example.com/manual", tags: [] },
    });
    expect(manual.statusCode).toBe(200);
    const unsafeManual = await app.inject({
      method: "POST", url: "/api/admin/signals", headers: { authorization: "Bearer test-admin-token" },
      payload: { title: "Unsafe link", summary: "Must be rejected", url: "javascript:alert(1)", tags: [] },
    });
    expect(unsafeManual.statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/public/projects" })).json().data).toEqual([]);
  });
});
