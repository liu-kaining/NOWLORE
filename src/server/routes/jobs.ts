import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireToken } from "../auth.js";
import type { AppContext } from "../context.js";

export async function jobRoutes(app: FastifyInstance, context: AppContext) {
  const auth = { preHandler: requireToken(context.config.cronToken) };
  app.post("/api/jobs/discover", auth, async (request) => context.discovery.run({
    timeoutMs: context.config.sources.timeoutMs, maxItems: context.config.sources.maxItems,
    actorType: "scheduler", actorId: "cloud-scheduler", requestId: request.id,
  }));
  app.post("/api/jobs/pipeline", auth, async (request) => {
    const body = z.object({ maxTopics: z.number().int().min(1).max(20).default(5), autoDesign: z.boolean().default(true) }).parse(request.body ?? {});
    return context.pipeline.run(body.maxTopics, body.autoDesign, "scheduler", "cloud-scheduler", request.id);
  });
  app.post("/api/jobs/track", auth, async (request) => {
    const state = await context.store.snapshot();
    const projectIds = Object.values(state.projects).filter((project) => project.status === "launched").map((project) => project.id);
    const results = [];
    for (const projectId of projectIds) {
      try { results.push({ projectId, ok: true, metric: await context.launches.refresh(projectId, "cloud-scheduler", request.id) }); }
      catch (error) { results.push({ projectId, ok: false, error: error instanceof Error ? error.message : String(error) }); }
    }
    return { results };
  });
}
