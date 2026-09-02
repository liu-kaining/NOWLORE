import { appendAudit } from "../domain/audit.js";
import { AppError } from "../domain/errors.js";
import { assertProjectTransition } from "../domain/project.js";
import type { AssetBundle, Project } from "../domain/schemas.js";
import { sha256 } from "../lib/hash.js";
import { isoNow, type Clock, systemClock } from "../lib/time.js";
import type { Store } from "../storage/store.js";
import type { ObjectPublisher } from "./publisher.js";
import { renderProjectPoster } from "./svg.js";

export class AssetService {
  constructor(
    private readonly store: Store,
    private readonly publisher: ObjectPublisher,
    private readonly publicSiteUrl: string,
    private readonly clock: Clock = systemClock,
  ) {}

  async publish(projectId: string, actorId: string, requestId?: string): Promise<Project> {
    const snapshot = await this.store.snapshot();
    const project = snapshot.projects[projectId];
    if (!project) throw new AppError("PROJECT_NOT_FOUND", "Project was not found", 404);
    if (project.status !== "approved") throw new AppError("PROJECT_NOT_APPROVED", "Project must be approved before asset publication", 409);
    const approval = project.approvalId ? snapshot.approvals[project.approvalId] : undefined;
    if (!approval || approval.decision !== "approved" || approval.contentHash !== project.contentHash) {
      throw new AppError("APPROVAL_MISMATCH", "Project approval does not match current content", 409);
    }

    const poster = renderProjectPoster(project);
    const posterHash = sha256(poster);
    const posterObject = await this.publisher.put(`projects/${project.id}/${posterHash}.svg`, poster, "image/svg+xml; charset=utf-8");
    const metadata = {
      name: project.name,
      symbol: project.symbol,
      description: `${project.description}\n\n${project.disclaimers.join(" ")}`,
      image: posterObject.url,
      external_url: `${this.publicSiteUrl}/projects/${project.slug}`,
      attributes: [
        { trait_type: "NOWLORE Project", value: project.id },
        { trait_type: "Experiment Ends", value: project.experimentEndsAt },
        { trait_type: "Team Allocation", value: project.teamAllocation },
        { trait_type: "Creator Initial Buy", value: project.creatorInitialBuy },
      ],
    };
    const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
    const metadataHash = sha256(metadataText);
    const metadataObject = await this.publisher.put(`projects/${project.id}/${metadataHash}.json`, metadataText, "application/json; charset=utf-8");
    if (metadataObject.url.length > 200) throw new AppError("METADATA_URI_TOO_LONG", "Pump metadata URI must not exceed 200 characters", 409);
    const now = isoNow(this.clock);
    const bundle: AssetBundle = {
      posterUrl: posterObject.url, posterSha256: posterHash,
      metadataUrl: metadataObject.url, metadataSha256: metadataHash, metadata,
      publishedAt: now, publisher: this.publisher.name,
    };
    return this.store.transact((state) => {
      const current = state.projects[projectId];
      if (!current || current.contentHash !== project.contentHash || current.status !== "approved") {
        throw new AppError("PROJECT_CHANGED_DURING_PUBLISH", "Project changed while assets were being published", 409);
      }
      assertProjectTransition(current.status, "assets_published");
      current.assetBundle = bundle;
      current.status = "assets_published";
      current.updatedAt = now;
      appendAudit(state, {
        actorType: "operator", actorId, action: "project.assets_published", entityType: "project", entityId: projectId,
        occurredAt: now, requestId, details: { posterSha256: posterHash, metadataSha256: metadataHash, publisher: this.publisher.name },
      });
      return structuredClone(current);
    });
  }
}
