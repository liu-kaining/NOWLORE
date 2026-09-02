import type { AppConfig } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import type { Assessment, JobRun, Project } from "../domain/schemas.js";
import { DiscoveryService } from "../pipeline/discovery.js";
import { ForgeService } from "../pipeline/forge.js";
import { OracleService } from "../pipeline/oracle.js";
import type { Store } from "../storage/store.js";

export interface PipelineResult {
  discovery: JobRun;
  assessments: Assessment[];
  projects: Project[];
  skipped: Array<{ topicId: string; reason: string }>;
}

export class PipelineService {
  constructor(
    private readonly store: Store,
    private readonly discovery: DiscoveryService,
    private readonly oracle: OracleService,
    private readonly forge: ForgeService,
    private readonly config: AppConfig,
  ) {}

  async run(maxTopics = 5, autoDesign = true, actorType: "operator" | "scheduler" = "operator", actorId = "pipeline", requestId?: string): Promise<PipelineResult> {
    const discovery = await this.discovery.run({
      timeoutMs: this.config.sources.timeoutMs,
      maxItems: this.config.sources.maxItems,
      actorType,
      actorId,
      ...(requestId ? { requestId } : {}),
    });
    const state = await this.store.snapshot();
    const topics = Object.values(state.topics)
      .filter((topic) => topic.status === "new" || topic.status === "queued")
      .sort((a, b) => b.heuristicScore - a.heuristicScore)
      .slice(0, Math.max(1, Math.min(20, maxTopics)));
    const assessments: Assessment[] = [];
    const projects: Project[] = [];
    const skipped: PipelineResult["skipped"] = [];
    for (const topic of topics) {
      try {
        const assessment = await this.oracle.evaluate(topic.id, actorId, requestId);
        assessments.push(assessment);
        if (autoDesign && assessment.recommendation === "design") {
          try {
            projects.push(await this.forge.design(topic.id, actorId, requestId));
          } catch (error) {
            skipped.push({ topicId: topic.id, reason: error instanceof AppError ? error.code : "DESIGN_FAILED" });
          }
        }
      } catch (error) {
        skipped.push({ topicId: topic.id, reason: error instanceof AppError ? error.code : "EVALUATION_FAILED" });
      }
    }
    return { discovery, assessments, projects, skipped };
  }
}
