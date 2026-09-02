import { z } from "zod";

export const SourceTypeSchema = z.enum(["rss", "polymarket", "hackernews", "huggingface", "manual", "webhook"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

const IsoDateSchema = z.string().datetime({ offset: true });
const ScoreSchema = z.number().min(0).max(100);
const HttpUrlSchema = z.string().url().max(2_048).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Only http and https URLs are allowed");

export const RawSignalSchema = z.object({
  source: z.string().min(1).max(80),
  sourceType: SourceTypeSchema,
  externalId: z.string().max(300).optional(),
  title: z.string().min(1).max(500),
  summary: z.string().max(4_000).default(""),
  url: HttpUrlSchema,
  publishedAt: IsoDateSchema,
  metrics: z.record(z.string(), z.number().finite().nonnegative()).default({}),
  tags: z.array(z.string().max(80)).max(30).default([]),
});
export type RawSignal = z.infer<typeof RawSignalSchema>;

export const SignalSchema = RawSignalSchema.extend({
  id: z.string(),
  observedAt: IsoDateSchema,
  rawHash: z.string().length(64),
  topicId: z.string().optional(),
});
export type Signal = z.infer<typeof SignalSchema>;

export const TopicSchema = z.object({
  id: z.string(),
  canonicalTitle: z.string().min(1).max(500),
  keywords: z.array(z.string()).max(40),
  signalIds: z.array(z.string()).min(1),
  sourceCount: z.number().int().nonnegative(),
  heuristicScore: ScoreSchema,
  freshnessScore: ScoreSchema,
  engagementScore: ScoreSchema,
  diversityScore: ScoreSchema,
  velocityScore: ScoreSchema,
  status: z.enum(["new", "queued", "evaluated", "archived"]),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Topic = z.infer<typeof TopicSchema>;

export const AssessmentScoresSchema = z.object({
  memeability: ScoreSchema,
  timeliness: ScoreSchema,
  verifiability: ScoreSchema,
  originality: ScoreSchema,
  controversy: ScoreSchema,
  legal: ScoreSchema,
  safety: ScoreSchema,
  brand: ScoreSchema,
});

export const AssessmentOutputSchema = z.object({
  summary: z.string().min(1).max(1_500),
  narrative: z.string().min(1).max(2_000),
  audience: z.array(z.string().min(1).max(120)).max(10),
  supportingEvidence: z.array(z.string().min(1).max(500)).max(12),
  counterEvidence: z.array(z.string().min(1).max(500)).max(12),
  scores: AssessmentScoresSchema,
  expectedWindowHours: z.number().int().min(1).max(720),
  confidence: z.number().min(0).max(1),
  riskFlags: z.array(z.string().min(1).max(160)).max(20),
  recommendation: z.enum(["reject", "watch", "design"]),
});
export type AssessmentOutput = z.infer<typeof AssessmentOutputSchema>;

export const AssessmentSchema = AssessmentOutputSchema.extend({
  id: z.string(),
  topicId: z.string(),
  inputHash: z.string().length(64),
  promptVersion: z.string(),
  providerProtocol: z.string(),
  providerName: z.string(),
  model: z.string(),
  createdAt: IsoDateSchema,
});
export type Assessment = z.infer<typeof AssessmentSchema>;

export const MemeConceptSchema = z.object({
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(13).regex(/^[A-Z0-9]+$/),
  tagline: z.string().min(1).max(180),
  thesis: z.string().min(1).max(1_500),
  description: z.string().min(1).max(4_000),
  visualPrompt: z.string().min(1).max(2_000),
  websiteCopy: z.string().min(1).max(4_000),
  socialDrafts: z.array(z.string().min(1).max(500)).min(1).max(8),
  riskDisclosures: z.array(z.string().min(1).max(500)).min(1).max(12),
  experimentWindowHours: z.number().int().min(1).max(720),
});
export type MemeConcept = z.infer<typeof MemeConceptSchema>;

export const ProjectStatusSchema = z.enum([
  "draft", "reviewed", "approved", "rejected", "approval_revoked", "assets_published", "simulated", "launching", "launched", "failed",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const AssetBundleSchema = z.object({
  posterUrl: HttpUrlSchema,
  posterSha256: z.string().length(64),
  metadataUrl: HttpUrlSchema,
  metadataSha256: z.string().length(64),
  metadata: z.record(z.string(), z.unknown()),
  publishedAt: IsoDateSchema,
  publisher: z.string(),
});
export type AssetBundle = z.infer<typeof AssetBundleSchema>;

export const ProjectSchema = MemeConceptSchema.extend({
  id: z.string(),
  sequence: z.number().int().positive(),
  slug: z.string(),
  topicId: z.string(),
  assessmentId: z.string(),
  signalIds: z.array(z.string()).min(1),
  experimentStartsAt: IsoDateSchema,
  experimentEndsAt: IsoDateSchema,
  disclaimers: z.array(z.string().min(1).max(1_000)).min(1),
  network: z.enum(["devnet", "mainnet-beta"]),
  quoteMint: z.string().default("SOL"),
  creatorWallet: z.string().optional(),
  teamAllocation: z.string().regex(/^\d+$/).default("0"),
  creatorInitialBuy: z.string().regex(/^\d+$/).default("0"),
  status: ProjectStatusSchema,
  revision: z.number().int().positive(),
  contentHash: z.string().length(64),
  approvalId: z.string().optional(),
  assetBundle: AssetBundleSchema.optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  publishedAt: IsoDateSchema.optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectRevision: z.number().int().positive(),
  contentHash: z.string().length(64),
  decision: z.enum(["approved", "rejected", "revoked"]),
  actor: z.string().min(1).max(120),
  reason: z.string().min(1).max(1_000),
  createdAt: IsoDateSchema,
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const SimulationResultSchema = z.object({
  ok: z.boolean(),
  simulatedAt: IsoDateSchema,
  expiresAt: IsoDateSchema,
  unitsConsumed: z.number().int().nonnegative().optional(),
  logs: z.array(z.string().max(1_000)).max(200),
  error: z.string().max(2_000).optional(),
  transactionBase64: z.string().optional(),
  mint: z.string(),
});
export type SimulationResult = z.infer<typeof SimulationResultSchema>;

export const LaunchRecordSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  idempotencyKeyHash: z.string().length(64),
  adapter: z.string(),
  network: z.enum(["devnet", "mainnet-beta"]),
  mint: z.string(),
  creatorWallet: z.string(),
  transactionSignature: z.string().optional(),
  simulation: SimulationResultSchema,
  status: z.enum(["simulated", "launching", "submitted", "confirmed", "failed"]),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  confirmedAt: IsoDateSchema.optional(),
});
export type LaunchRecord = z.infer<typeof LaunchRecordSchema>;

export const MetricSnapshotSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  launchId: z.string(),
  observedAt: IsoDateSchema,
  transactionStatus: z.string(),
  creatorWalletLamports: z.string().regex(/^\d+$/),
  creatorVaultLamports: z.string().regex(/^\d+$/),
  collectedCreatorFeesLamports: z.string().regex(/^\d+$/),
  source: z.string(),
});
export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>;

export const AuditEventSchema = z.object({
  id: z.string(),
  sequence: z.number().int().positive(),
  occurredAt: IsoDateSchema,
  actorType: z.enum(["system", "operator", "scheduler"]),
  actorId: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  requestId: z.string().optional(),
  runId: z.string().optional(),
  previousHash: z.string(),
  payloadHash: z.string().length(64),
  details: z.record(z.string(), z.unknown()).default({}),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const JobRunSchema = z.object({
  id: z.string(),
  kind: z.enum(["discover", "evaluate", "design", "pipeline", "track"]),
  status: z.enum(["running", "succeeded", "failed", "partial"]),
  startedAt: IsoDateSchema,
  finishedAt: IsoDateSchema.optional(),
  counters: z.record(z.string(), z.number().int().nonnegative()).default({}),
  errors: z.array(z.object({ source: z.string(), code: z.string(), message: z.string() })).default([]),
  leaseOwner: z.string().optional(),
  leaseExpiresAt: IsoDateSchema.optional(),
});
export type JobRun = z.infer<typeof JobRunSchema>;

export const DatabaseStateSchema = z.object({
  schemaVersion: z.literal(1),
  signals: z.record(z.string(), SignalSchema),
  topics: z.record(z.string(), TopicSchema),
  assessments: z.record(z.string(), AssessmentSchema),
  projects: z.record(z.string(), ProjectSchema),
  approvals: z.record(z.string(), ApprovalSchema),
  launches: z.record(z.string(), LaunchRecordSchema),
  metricSnapshots: z.record(z.string(), MetricSnapshotSchema),
  auditEvents: z.array(AuditEventSchema),
  jobRuns: z.record(z.string(), JobRunSchema),
});
export type DatabaseState = z.infer<typeof DatabaseStateSchema>;

export function emptyDatabaseState(): DatabaseState {
  return {
    schemaVersion: 1,
    signals: {},
    topics: {},
    assessments: {},
    projects: {},
    approvals: {},
    launches: {},
    metricSnapshots: {},
    auditEvents: [],
    jobRuns: {},
  };
}
