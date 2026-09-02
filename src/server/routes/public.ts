import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

export async function publicRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/api/public/stats", async () => {
    const state = await context.store.snapshot();
    const publicProjects = Object.values(state.projects).filter(isPublic);
    return {
      projects: publicProjects.length,
      launched: publicProjects.filter((project) => project.status === "launched").length,
      sources: new Set(publicProjects.flatMap((project) => project.signalIds.map((id) => state.signals[id]?.source).filter(Boolean))).size,
      creatorFeesLamports: latestMetrics(state, publicProjects.map((project) => project.id)).reduce((sum, metric) => sum + BigInt(metric.creatorVaultLamports), 0n).toString(),
    };
  });

  app.get("/api/public/projects", async (request) => {
    const query = request.query as { limit?: string; cursor?: string };
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20));
    const state = await context.store.snapshot();
    const projects = Object.values(state.projects).filter(isPublic).sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));
    const start = query.cursor ? Math.max(0, projects.findIndex((project) => project.id === query.cursor) + 1) : 0;
    const page = projects.slice(start, start + limit).map((project) => publicProject(project, state));
    return { data: page, nextCursor: projects[start + limit]?.id ?? null };
  });

  app.get("/api/public/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const state = await context.store.snapshot();
    const project = Object.values(state.projects).find((item) => item.id === id || item.slug === id);
    if (!project || !isPublic(project)) return reply.code(404).send({ error: { code: "PROJECT_NOT_FOUND", message: "Project was not found", requestId: request.id } });
    return publicProject(project, state);
  });

  app.get("/api/public/signals", async () => {
    const state = await context.store.snapshot();
    const ids = new Set(Object.values(state.projects).filter(isPublic).flatMap((project) => project.signalIds));
    return { data: [...ids].flatMap((id) => state.signals[id] ? [state.signals[id]] : []).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) };
  });

  app.get("/api/public/ledger", async () => {
    const state = await context.store.snapshot();
    const publicProjectIds = new Set(Object.values(state.projects).filter(isPublic).map((project) => project.id));
    const launchIds = new Set(Object.values(state.launches).filter((launch) => publicProjectIds.has(launch.projectId)).map((launch) => launch.id));
    const events = state.auditEvents.filter((event) =>
      (event.entityType === "project" && publicProjectIds.has(event.entityId)) ||
      (event.entityType === "launch" && launchIds.has(event.entityId)) ||
      (event.entityType === "metricSnapshot" && Boolean(state.metricSnapshots[event.entityId] && publicProjectIds.has(state.metricSnapshots[event.entityId]!.projectId))),
    );
    return { data: events, head: state.auditEvents.at(-1)?.payloadHash ?? "GENESIS" };
  });
}

function isPublic(project: { publishedAt?: string | undefined; status: string }): boolean {
  return Boolean(project.publishedAt) || project.status === "launched";
}

function latestMetrics(state: Awaited<ReturnType<AppContext["store"]["snapshot"]>>, projectIds: string[]) {
  const wanted = new Set(projectIds);
  const byProject = new Map<string, (typeof state.metricSnapshots)[string]>();
  for (const metric of Object.values(state.metricSnapshots).sort((a, b) => a.observedAt.localeCompare(b.observedAt))) {
    if (wanted.has(metric.projectId)) byProject.set(metric.projectId, metric);
  }
  return [...byProject.values()];
}

function publicProject(project: (Awaited<ReturnType<AppContext["store"]["snapshot"]>>["projects"])[string], state: Awaited<ReturnType<AppContext["store"]["snapshot"]>>) {
  const assessment = state.assessments[project.assessmentId];
  const launches = Object.values(state.launches).filter((launch) => launch.projectId === project.id);
  const metrics = Object.values(state.metricSnapshots).filter((metric) => metric.projectId === project.id).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const signals = project.signalIds.flatMap((id) => state.signals[id] ? [state.signals[id]] : []);
  return {
    ...project,
    assessment: assessment ? {
      summary: assessment.summary, narrative: assessment.narrative, scores: assessment.scores,
      confidence: assessment.confidence, expectedWindowHours: assessment.expectedWindowHours,
      providerProtocol: assessment.providerProtocol, model: assessment.model, createdAt: assessment.createdAt,
    } : null,
    signals,
    launches,
    metrics,
  };
}
