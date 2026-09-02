import { z } from "zod";
import { appendAudit } from "../domain/audit.js";
import { AppError } from "../domain/errors.js";
import { assertFairLaunch, assertProjectTransition, computeProjectContentHash } from "../domain/project.js";
import type { Approval, Project } from "../domain/schemas.js";
import { createId } from "../lib/id.js";
import { slugify } from "../lib/text.js";
import { isoNow, type Clock, systemClock } from "../lib/time.js";
import type { Store } from "../storage/store.js";
import { assertDesignable } from "../pipeline/forge.js";

export const ProjectPatchSchema = z.object({
  name: z.string().min(1).max(32).optional(),
  symbol: z.string().min(1).max(13).regex(/^[A-Z0-9]+$/).optional(),
  tagline: z.string().min(1).max(180).optional(),
  thesis: z.string().min(1).max(1_500).optional(),
  description: z.string().min(1).max(4_000).optional(),
  visualPrompt: z.string().min(1).max(2_000).optional(),
  websiteCopy: z.string().min(1).max(4_000).optional(),
  socialDrafts: z.array(z.string().min(1).max(500)).min(1).max(8).optional(),
  riskDisclosures: z.array(z.string().min(1).max(500)).min(1).max(12).optional(),
  experimentWindowHours: z.number().int().min(1).max(720).optional(),
  experimentStartsAt: z.string().datetime({ offset: true }).optional(),
  experimentEndsAt: z.string().datetime({ offset: true }).optional(),
  disclaimers: z.array(z.string().min(1).max(1_000)).min(1).optional(),
});
export type ProjectPatch = z.infer<typeof ProjectPatchSchema>;

export class ProjectService {
  constructor(private readonly store: Store, private readonly clock: Clock = systemClock) {}

  async patch(projectId: string, input: ProjectPatch, expectedHash: string, actorId: string, requestId?: string): Promise<Project> {
    const patch = ProjectPatchSchema.parse(input);
    return this.store.transact((state) => {
      const project = requireProject(state.projects[projectId]);
      if (!new Set(["draft", "reviewed", "rejected", "approval_revoked"]).has(project.status)) {
        throw new AppError("PROJECT_NOT_EDITABLE", "Project cannot be edited in its current state", 409);
      }
      if (project.contentHash !== expectedHash) throw new AppError("PROJECT_VERSION_CONFLICT", "Project has changed", 412);
      Object.assign(project, patch);
      if (patch.experimentEndsAt) {
        const durationHours = (new Date(project.experimentEndsAt).getTime() - new Date(project.experimentStartsAt).getTime()) / 3_600_000;
        if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720) {
          throw new AppError("INVALID_EXPERIMENT_WINDOW", "Experiment end must be 1 to 720 whole hours after its start", 400);
        }
        if (patch.experimentWindowHours !== undefined && patch.experimentWindowHours !== durationHours) {
          throw new AppError("INVALID_EXPERIMENT_WINDOW", "Experiment duration does not match experimentWindowHours", 400);
        }
        project.experimentWindowHours = durationHours;
      } else if (patch.experimentStartsAt || patch.experimentWindowHours !== undefined) {
        project.experimentEndsAt = new Date(new Date(project.experimentStartsAt).getTime() + project.experimentWindowHours * 3_600_000).toISOString();
      }
      project.revision += 1;
      project.status = "draft";
      project.slug = `${slugify(project.name)}-${String(project.sequence).padStart(3, "0")}`;
      project.updatedAt = isoNow(this.clock);
      delete project.approvalId;
      delete project.assetBundle;
      project.contentHash = computeProjectContentHash(project);
      appendAudit(state, {
        actorType: "operator", actorId, action: "project.updated", entityType: "project", entityId: project.id,
        occurredAt: project.updatedAt, requestId, details: { revision: project.revision, contentHash: project.contentHash, changedFields: Object.keys(patch) },
      });
      return structuredClone(project);
    });
  }

  async review(projectId: string, actorId: string, requestId?: string): Promise<Project> {
    return this.transition(projectId, "reviewed", actorId, "project.reviewed", requestId);
  }

  async approve(projectId: string, expectedContentHash: string, reason: string, actorId: string, requestId?: string): Promise<Project> {
    return this.store.transact((state) => {
      const project = requireProject(state.projects[projectId]);
      if (project.status !== "reviewed") throw new AppError("PROJECT_NOT_REVIEWED", "Project must be reviewed before approval", 409);
      if (project.contentHash !== expectedContentHash) throw new AppError("PROJECT_VERSION_CONFLICT", "Approval hash does not match project", 412);
      assertFairLaunch(project);
      const assessment = state.assessments[project.assessmentId];
      if (!assessment) throw new AppError("ASSESSMENT_REQUIRED", "Project assessment is missing", 409);
      assertDesignable(assessment);
      assertProjectTransition(project.status, "approved");
      const now = isoNow(this.clock);
      const approval: Approval = {
        id: createId("approval"), projectId, projectRevision: project.revision, contentHash: project.contentHash,
        decision: "approved", actor: actorId, reason, createdAt: now,
      };
      state.approvals[approval.id] = approval;
      project.approvalId = approval.id;
      project.status = "approved";
      project.updatedAt = now;
      appendAudit(state, {
        actorType: "operator", actorId, action: "project.approved", entityType: "project", entityId: project.id,
        occurredAt: now, requestId, details: { approvalId: approval.id, contentHash: approval.contentHash, reason },
      });
      return structuredClone(project);
    });
  }

  async reject(projectId: string, reason: string, actorId: string, requestId?: string): Promise<Project> {
    return this.decide(projectId, "rejected", reason, actorId, requestId);
  }

  async revoke(projectId: string, reason: string, actorId: string, requestId?: string): Promise<Project> {
    return this.decide(projectId, "revoked", reason, actorId, requestId);
  }

  private async decide(projectId: string, decision: "rejected" | "revoked", reason: string, actorId: string, requestId?: string): Promise<Project> {
    return this.store.transact((state) => {
      const project = requireProject(state.projects[projectId]);
      const target = decision === "rejected" ? "rejected" : "approval_revoked";
      assertProjectTransition(project.status, target);
      const now = isoNow(this.clock);
      const approval: Approval = {
        id: createId("approval"), projectId, projectRevision: project.revision, contentHash: project.contentHash,
        decision, actor: actorId, reason, createdAt: now,
      };
      state.approvals[approval.id] = approval;
      project.approvalId = approval.id;
      project.status = target;
      project.updatedAt = now;
      appendAudit(state, {
        actorType: "operator", actorId, action: `project.${decision}`, entityType: "project", entityId: project.id,
        occurredAt: now, requestId, details: { approvalId: approval.id, reason },
      });
      return structuredClone(project);
    });
  }

  private async transition(projectId: string, target: Project["status"], actorId: string, action: string, requestId?: string): Promise<Project> {
    return this.store.transact((state) => {
      const project = requireProject(state.projects[projectId]);
      assertProjectTransition(project.status, target);
      project.status = target;
      project.updatedAt = isoNow(this.clock);
      appendAudit(state, {
        actorType: "operator", actorId, action, entityType: "project", entityId: project.id,
        occurredAt: project.updatedAt, requestId, details: { contentHash: project.contentHash },
      });
      return structuredClone(project);
    });
  }
}

function requireProject(project: Project | undefined): Project {
  if (!project) throw new AppError("PROJECT_NOT_FOUND", "Project was not found", 404);
  return project;
}
