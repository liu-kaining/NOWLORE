import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { publicCapabilities } from "../../config/env.js";
import { verifyAuditChain } from "../../domain/audit.js";
import { AppError } from "../../domain/errors.js";
import { actorId, requireToken } from "../auth.js";
import type { AppContext } from "../context.js";
import { ManualSignalInputSchema } from "../../services/manual.js";
import { ProjectPatchSchema } from "../../services/projects.js";

const ReasonSchema = z.object({ reason: z.string().min(1).max(1_000) });

export async function adminRoutes(app: FastifyInstance, context: AppContext) {
  const auth = { preHandler: requireToken(context.config.adminToken) };

  app.get("/api/admin/capabilities", auth, async () => publicCapabilities(context.config));
  app.get("/api/admin/overview", auth, async () => {
    const state = await context.store.snapshot();
    const projects = Object.values(state.projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((project) => ({
      ...project,
      assessment: state.assessments[project.assessmentId] ?? null,
      signals: project.signalIds.flatMap((id) => state.signals[id] ? [state.signals[id]] : []),
      launches: Object.values(state.launches).filter((launch) => launch.projectId === project.id),
      metrics: Object.values(state.metricSnapshots).filter((metric) => metric.projectId === project.id).sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
    }));
    return {
      signals: Object.values(state.signals).sort((a, b) => b.observedAt.localeCompare(a.observedAt)),
      topics: Object.values(state.topics).sort((a, b) => b.heuristicScore - a.heuristicScore),
      assessments: Object.values(state.assessments).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      projects,
      launches: Object.values(state.launches).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      runs: Object.values(state.jobRuns).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    };
  });
  app.get("/api/admin/signals", auth, async () => {
    const state = await context.store.snapshot();
    return { signals: Object.values(state.signals), topics: Object.values(state.topics) };
  });
  app.post("/api/admin/signals", auth, async (request) => {
    return context.manual.ingest(ManualSignalInputSchema.parse(request.body), actorId(request), request.id);
  });
  app.post("/api/admin/discover", auth, async (request) => context.discovery.run({
    timeoutMs: context.config.sources.timeoutMs, maxItems: context.config.sources.maxItems,
    actorType: "operator", actorId: actorId(request), requestId: request.id,
  }));
  app.post("/api/admin/topics/:id/evaluate", auth, async (request) => {
    const { id } = request.params as { id: string };
    return context.oracle.evaluate(id, actorId(request), request.id);
  });
  app.post("/api/admin/topics/:id/design", auth, async (request) => {
    const { id } = request.params as { id: string };
    return context.forge.design(id, actorId(request), request.id);
  });
  app.patch("/api/admin/projects/:id", auth, async (request) => {
    const { id } = request.params as { id: string };
    const expected = request.headers["if-match"];
    if (typeof expected !== "string") throw new AppError("IF_MATCH_REQUIRED", "If-Match header is required", 428);
    return context.projects.patch(id, ProjectPatchSchema.parse(request.body), expected, actorId(request), request.id);
  });
  app.post("/api/admin/projects/:id/review", auth, async (request) => context.projects.review((request.params as any).id, actorId(request), request.id));
  app.post("/api/admin/projects/:id/approve", auth, async (request) => {
    const body = z.object({ expectedContentHash: z.string().length(64), reason: z.string().min(1).max(1_000) }).parse(request.body);
    return context.projects.approve((request.params as any).id, body.expectedContentHash, body.reason, actorId(request), request.id);
  });
  app.post("/api/admin/projects/:id/reject", auth, async (request) => {
    const body = ReasonSchema.parse(request.body);
    return context.projects.reject((request.params as any).id, body.reason, actorId(request), request.id);
  });
  app.post("/api/admin/projects/:id/revoke", auth, async (request) => {
    const body = ReasonSchema.parse(request.body);
    return context.projects.revoke((request.params as any).id, body.reason, actorId(request), request.id);
  });
  app.post("/api/admin/projects/:id/assets", auth, async (request) => context.assets.publish((request.params as any).id, actorId(request), request.id));
  app.post("/api/admin/projects/:id/simulate", auth, async (request) => context.launches.simulate((request.params as any).id, actorId(request), request.id));
  app.post("/api/admin/projects/:id/launch", auth, async (request) => {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string") throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required", 428);
    return context.launches.launch((request.params as any).id, key, actorId(request), request.id);
  });
  app.post("/api/admin/projects/:id/refresh", auth, async (request) => context.launches.refresh((request.params as any).id, actorId(request), request.id));
  app.post("/api/admin/pipeline/run", auth, async (request) => {
    const body = z.object({ maxTopics: z.number().int().min(1).max(20).default(5), autoDesign: z.boolean().default(true) }).parse(request.body ?? {});
    return context.pipeline.run(body.maxTopics, body.autoDesign, "operator", actorId(request), request.id);
  });
  app.get("/api/admin/runs", auth, async () => ({ data: Object.values((await context.store.snapshot()).jobRuns) }));
  app.get("/api/admin/audit/verify", auth, async () => verifyAuditChain((await context.store.snapshot()).auditEvents));
}
