import { AppError } from "./errors.js";
import type { Project, ProjectStatus } from "./schemas.js";
import { sha256 } from "../lib/hash.js";

const TRANSITIONS: Record<ProjectStatus, ReadonlySet<ProjectStatus>> = {
  draft: new Set(["reviewed", "rejected"]),
  reviewed: new Set(["draft", "approved", "rejected"]),
  approved: new Set(["approval_revoked", "assets_published"]),
  rejected: new Set(["draft"]),
  approval_revoked: new Set(["reviewed"]),
  assets_published: new Set(["approval_revoked", "simulated"]),
  simulated: new Set(["approval_revoked", "launching"]),
  launching: new Set(["launched", "failed"]),
  launched: new Set([]),
  failed: new Set(["simulated", "launching"]),
};

export function assertProjectTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!TRANSITIONS[from].has(to)) {
    throw new AppError("INVALID_PROJECT_TRANSITION", `Cannot transition project from ${from} to ${to}`, 409);
  }
}

export function projectContent(project: Pick<Project,
  "name" | "symbol" | "tagline" | "thesis" | "description" | "visualPrompt" | "websiteCopy" | "socialDrafts" |
  "riskDisclosures" | "experimentWindowHours" | "experimentStartsAt" | "experimentEndsAt" | "disclaimers" | "network" |
  "quoteMint" | "teamAllocation" | "creatorInitialBuy" | "signalIds"
>): Record<string, unknown> {
  return {
    name: project.name,
    symbol: project.symbol,
    tagline: project.tagline,
    thesis: project.thesis,
    description: project.description,
    visualPrompt: project.visualPrompt,
    websiteCopy: project.websiteCopy,
    socialDrafts: project.socialDrafts,
    riskDisclosures: project.riskDisclosures,
    experimentWindowHours: project.experimentWindowHours,
    experimentStartsAt: project.experimentStartsAt,
    experimentEndsAt: project.experimentEndsAt,
    disclaimers: project.disclaimers,
    network: project.network,
    quoteMint: project.quoteMint,
    teamAllocation: project.teamAllocation,
    creatorInitialBuy: project.creatorInitialBuy,
    signalIds: project.signalIds,
  };
}

export function computeProjectContentHash(project: Parameters<typeof projectContent>[0]): string {
  return sha256(projectContent(project));
}

export function assertFairLaunch(project: Project): void {
  if (project.teamAllocation !== "0" || project.creatorInitialBuy !== "0") {
    throw new AppError("FAIR_LAUNCH_REQUIRED", "MVP launches require zero team allocation and zero creator initial buy", 409);
  }
}
