import { appendAudit } from "../domain/audit.js";
import { AppError, errorMessage } from "../domain/errors.js";
import { assertFairLaunch, assertProjectTransition } from "../domain/project.js";
import type { LaunchRecord, MetricSnapshot, Project } from "../domain/schemas.js";
import { sha256 } from "../lib/hash.js";
import { createId } from "../lib/id.js";
import { isoNow, type Clock, systemClock } from "../lib/time.js";
import type { ChainAdapter } from "../chain/types.js";
import type { Store } from "../storage/store.js";

export class LaunchService {
  constructor(private readonly store: Store, private readonly chain: ChainAdapter, private readonly mainnetEnabled: boolean, private readonly clock: Clock = systemClock) {}

  async simulate(projectId: string, actorId: string, requestId?: string): Promise<LaunchRecord> {
    const snapshot = await this.store.snapshot();
    const project = requireProject(snapshot.projects[projectId]);
    if (project.status !== "assets_published" && project.status !== "failed") {
      throw new AppError("ASSETS_REQUIRED", "Project must have approved published assets before simulation", 409);
    }
    assertLaunchGates(project, snapshot.approvals, this.mainnetEnabled);
    const simulation = await this.chain.simulate(project);
    if (!simulation.ok) throw new AppError("SOLANA_SIMULATION_FAILED", "Launch simulation failed", 409, { error: simulation.error });
    const now = isoNow(this.clock);
    const record: LaunchRecord = {
      id: createId("launch"), projectId, idempotencyKeyHash: sha256(`simulation:${projectId}:${project.contentHash}`),
      adapter: this.chain.name, network: project.network, mint: simulation.mint, creatorWallet: this.chain.creatorWallet(),
      simulation, status: "simulated", createdAt: now, updatedAt: now,
    };
    return this.store.transact((state) => {
      const current = requireProject(state.projects[projectId]);
      if (current.contentHash !== project.contentHash) throw new AppError("PROJECT_VERSION_CONFLICT", "Project changed during simulation", 409);
      if (current.status === "assets_published") assertProjectTransition(current.status, "simulated");
      current.status = "simulated";
      current.creatorWallet = record.creatorWallet;
      current.updatedAt = now;
      state.launches[record.id] = record;
      appendAudit(state, {
        actorType: "operator", actorId, action: "project.simulated", entityType: "launch", entityId: record.id,
        occurredAt: now, requestId, details: { projectId, mint: record.mint, adapter: record.adapter, unitsConsumed: simulation.unitsConsumed },
      });
      return structuredClone(record);
    });
  }

  async launch(projectId: string, idempotencyKey: string, actorId: string, requestId?: string): Promise<LaunchRecord> {
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new AppError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8 to 128 characters", 400);
    const keyHash = sha256(idempotencyKey);
    const prepared = await this.store.transact((state) => {
      const existing = Object.values(state.launches).find((launch) => launch.projectId === projectId && launch.idempotencyKeyHash === keyHash);
      if (existing) return { existing: structuredClone(existing) } as const;
      const project = requireProject(state.projects[projectId]);
      if (project.status !== "simulated") throw new AppError("SIMULATION_REQUIRED", "Project must have a successful current simulation", 409);
      assertLaunchGates(project, state.approvals, this.mainnetEnabled);
      const simulationRecord = Object.values(state.launches)
        .filter((launch) => launch.projectId === projectId && launch.status === "simulated")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!simulationRecord || simulationRecord.simulation.expiresAt <= isoNow(this.clock)) {
        throw new AppError("SIMULATION_EXPIRED", "Launch simulation has expired", 409);
      }
      const conflicting = Object.values(state.launches).find((launch) => launch.projectId === projectId && new Set(["launching", "submitted", "confirmed"]).has(launch.status));
      if (conflicting) throw new AppError("LAUNCH_ALREADY_EXISTS", "Project already has an active or confirmed launch", 409);
      assertProjectTransition(project.status, "launching");
      project.status = "launching";
      project.updatedAt = isoNow(this.clock);
      simulationRecord.idempotencyKeyHash = keyHash;
      simulationRecord.status = "launching";
      simulationRecord.updatedAt = project.updatedAt;
      appendAudit(state, {
        actorType: "operator", actorId, action: "project.launching", entityType: "launch", entityId: simulationRecord.id,
        occurredAt: project.updatedAt, requestId, details: { projectId, adapter: this.chain.name },
      });
      return { project: structuredClone(project), launchId: simulationRecord.id } as const;
    });
    if ("existing" in prepared) return prepared.existing;

    try {
      const execution = await this.chain.launch(prepared.project);
      return await this.store.transact((state) => {
        const project = requireProject(state.projects[projectId]);
        const record = state.launches[prepared.launchId]!;
        record.mint = execution.mint;
        record.creatorWallet = execution.creatorWallet;
        record.transactionSignature = execution.transactionSignature;
        record.simulation = execution.simulation;
        record.status = execution.confirmed ? "confirmed" : "submitted";
        record.updatedAt = isoNow(this.clock);
        if (execution.confirmedAt) record.confirmedAt = execution.confirmedAt;
        project.creatorWallet = execution.creatorWallet;
        project.updatedAt = record.updatedAt;
        if (execution.confirmed) {
          assertProjectTransition(project.status, "launched");
          project.status = "launched";
          project.publishedAt = record.confirmedAt ?? record.updatedAt;
        }
        appendAudit(state, {
          actorType: "operator", actorId, action: execution.confirmed ? "project.launched" : "project.submitted", entityType: "launch", entityId: record.id,
          occurredAt: record.updatedAt, requestId, details: {
            projectId, mint: record.mint, creatorWallet: record.creatorWallet,
            transactionSignature: record.transactionSignature, network: record.network,
          },
        });
        return structuredClone(record);
      });
    } catch (error) {
      await this.store.transact((state) => {
        const project = state.projects[projectId];
        const record = state.launches[prepared.launchId];
        const now = isoNow(this.clock);
        const unknownSignature = error instanceof AppError && error.code === "SOLANA_SUBMISSION_UNKNOWN" && typeof error.details?.transactionSignature === "string"
          ? error.details.transactionSignature
          : undefined;
        if (project?.status === "launching" && !unknownSignature) project.status = "failed";
        if (project) project.updatedAt = now;
        if (record) {
          record.status = unknownSignature ? "submitted" : "failed";
          if (unknownSignature) record.transactionSignature = unknownSignature;
          record.errorCode = error instanceof AppError ? error.code : "LAUNCH_FAILED";
          record.errorMessage = errorMessage(error).slice(0, 1_000);
          record.updatedAt = now;
        }
        appendAudit(state, {
          actorType: "system", actorId: "launch-service", action: unknownSignature ? "project.submission_unknown" : "project.launch_failed", entityType: "launch", entityId: prepared.launchId,
          occurredAt: now, requestId, details: { projectId, errorCode: record?.errorCode ?? "LAUNCH_FAILED" },
        });
      });
      throw error;
    }
  }

  async refresh(projectId: string, actorId = "tracker", requestId?: string): Promise<MetricSnapshot> {
    const snapshot = await this.store.snapshot();
    const launch = Object.values(snapshot.launches)
      .filter((item) => item.projectId === projectId && new Set(["submitted", "confirmed"]).has(item.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!launch) throw new AppError("LAUNCH_NOT_FOUND", "No submitted launch exists for project", 404);
    const refresh = await this.chain.refresh(launch);
    const metric: MetricSnapshot = {
      id: createId("metric"), projectId, launchId: launch.id, observedAt: isoNow(this.clock), ...refresh, source: this.chain.name,
    };
    await this.store.transact((state) => {
      state.metricSnapshots[metric.id] = metric;
      const currentLaunch = state.launches[launch.id];
      const project = state.projects[projectId];
      let reconciliation: "launched" | "failed" | undefined;
      if (currentLaunch?.status === "submitted" && project?.status === "launching") {
        if (new Set(["confirmed", "finalized"]).has(refresh.transactionStatus)) {
          assertProjectTransition(project.status, "launched");
          currentLaunch.status = "confirmed";
          currentLaunch.confirmedAt = metric.observedAt;
          currentLaunch.updatedAt = metric.observedAt;
          project.status = "launched";
          project.publishedAt = metric.observedAt;
          project.updatedAt = metric.observedAt;
          delete currentLaunch.errorCode;
          delete currentLaunch.errorMessage;
          reconciliation = "launched";
        } else if (refresh.transactionStatus === "failed") {
          assertProjectTransition(project.status, "failed");
          currentLaunch.status = "failed";
          currentLaunch.updatedAt = metric.observedAt;
          project.status = "failed";
          project.updatedAt = metric.observedAt;
          reconciliation = "failed";
        }
      }
      appendAudit(state, {
        actorType: "system", actorId, action: "launch.refreshed", entityType: "metricSnapshot", entityId: metric.id,
        occurredAt: metric.observedAt, requestId, details: { projectId, launchId: launch.id, transactionStatus: metric.transactionStatus },
      });
      if (reconciliation) {
        appendAudit(state, {
          actorType: "system", actorId, action: reconciliation === "launched" ? "project.launched" : "project.launch_failed",
          entityType: "launch", entityId: launch.id, occurredAt: metric.observedAt, requestId,
          details: { projectId, transactionSignature: currentLaunch?.transactionSignature, reconciledBy: "tracker" },
        });
      }
    });
    return metric;
  }
}

function requireProject(project: Project | undefined): Project {
  if (!project) throw new AppError("PROJECT_NOT_FOUND", "Project was not found", 404);
  return project;
}

function assertLaunchGates(project: Project, approvals: Record<string, { decision: string; contentHash: string }>, mainnetEnabled: boolean): void {
  assertFairLaunch(project);
  const approval = project.approvalId ? approvals[project.approvalId] : undefined;
  if (!approval || approval.decision !== "approved" || approval.contentHash !== project.contentHash) {
    throw new AppError("APPROVAL_MISMATCH", "A matching current approval is required", 409);
  }
  if (!project.assetBundle) throw new AppError("ASSETS_REQUIRED", "Published assets are required", 409);
  if (project.network === "mainnet-beta" && !mainnetEnabled) throw new AppError("MAINNET_DISABLED", "Mainnet launch is disabled", 503);
}
