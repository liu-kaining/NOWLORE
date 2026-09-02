import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ZodError } from "zod";
import type { AppConfig } from "../config/env.js";
import { publicCapabilities } from "../config/env.js";
import { verifyAuditChain } from "../domain/audit.js";
import { AppError } from "../domain/errors.js";
import { createContext, type AppOverrides } from "./context.js";
import { adminRoutes } from "./routes/admin.js";
import { jobRoutes } from "./routes/jobs.js";
import { publicRoutes } from "./routes/public.js";

export async function buildApp(config: AppConfig, overrides: AppOverrides = {}) {
  const context = await createContext(config, overrides);
  const app = Fastify({
    logger: { level: config.logLevel, redact: ["req.headers.authorization", "req.headers.cookie", "*.apiKey", "*.privateKey", "*.secretAccessKey"] },
    bodyLimit: 256 * 1024,
    trustProxy: true,
    genReqId: () => `req_${crypto.randomUUID().replaceAll("-", "")}`,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'"],
      },
    },
  });
  await app.register(cors, { origin: config.corsOrigins, credentials: false, methods: ["GET", "POST", "PATCH", "OPTIONS"] });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, requestId: request.id, ...(error.details ? { details: error.details } : {}) } });
    }
    const validationIssues = getZodIssues(error);
    if (validationIssues) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Request validation failed", requestId: request.id, details: { issues: validationIssues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) } } });
    }
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error", requestId: request.id } });
  });

  app.get("/healthz", async () => ({ ok: true, service: "nowlore", time: new Date().toISOString() }));
  app.get("/readyz", async (_request, reply) => {
    const storage = await context.store.health();
    const audit = verifyAuditChain((await context.store.snapshot()).auditEvents);
    const ok = storage.ok && audit.valid;
    return reply.code(ok ? 200 : 503).send({ ok, storage, audit, capabilities: publicCapabilities(config) });
  });

  await publicRoutes(app, context);
  await adminRoutes(app, context);
  await jobRoutes(app, context);

  if (config.assets.driver === "local") {
    await mkdir(resolve(config.assets.localPath), { recursive: true });
    await app.register(fastifyStatic, { root: resolve(config.assets.localPath), prefix: "/assets/", decorateReply: true });
  }
  const webRoot = resolve("dist/web");
  const hasWeb = await access(webRoot).then(() => true, () => false);
  if (hasWeb) {
    await app.register(fastifyStatic, { root: webRoot, prefix: "/", decorateReply: config.assets.driver !== "local", wildcard: false });
    app.get("/*", async (request, reply) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/assets/")) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found", requestId: request.id } });
      return reply.sendFile("index.html", webRoot);
    });
  }

  app.addHook("onClose", async () => context.store.close());
  return { app, context };
}

function getZodIssues(error: unknown): ZodError["issues"] | undefined {
  if (error instanceof ZodError) return error.issues;
  if (typeof error !== "object" || error === null || (error as { name?: unknown }).name !== "ZodError") return undefined;
  const issues = (error as { issues?: unknown }).issues;
  return Array.isArray(issues) ? issues as ZodError["issues"] : undefined;
}
