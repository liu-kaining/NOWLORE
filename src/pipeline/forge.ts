import { appendAudit } from "../domain/audit.js";
import { AppError } from "../domain/errors.js";
import { computeProjectContentHash } from "../domain/project.js";
import { MemeConceptSchema, type Assessment, type MemeConcept, type Project, type Signal, type Topic } from "../domain/schemas.js";
import { createId } from "../lib/id.js";
import { keywords, slugify } from "../lib/text.js";
import { isoNow, type Clock, systemClock } from "../lib/time.js";
import type { AiProvider } from "../ai/types.js";
import type { Store } from "../storage/store.js";
import { CONCEPT_PROMPT_VERSION, FORGE_SYSTEM_PROMPT, STANDARD_DISCLAIMER } from "./prompts.js";

const BLOCKING_FLAG = /(death|disaster|minor|child|hate|harassment|impersonation|fraud|死亡|灾难|儿童|仇恨|冒充|欺诈)/i;

export class ForgeService {
  constructor(
    private readonly store: Store,
    private readonly ai: AiProvider,
    private readonly network: "devnet" | "mainnet-beta",
    private readonly clock: Clock = systemClock,
  ) {}

  async design(topicId: string, actorId = "forge", requestId?: string): Promise<Project> {
    const snapshot = await this.store.snapshot();
    const topic = snapshot.topics[topicId];
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", "Topic was not found", 404);
    const assessment = latestAssessment(snapshot.assessments, topicId);
    if (!assessment) throw new AppError("ASSESSMENT_REQUIRED", "Topic must be evaluated before design", 409);
    assertDesignable(assessment);
    const existing = Object.values(snapshot.projects).find((project) => project.assessmentId === assessment.id);
    if (existing) return existing;
    const signals = topic.signalIds.flatMap((id) => snapshot.signals[id] ? [snapshot.signals[id]] : []);
    const concept = await this.ai.generateStructured<MemeConcept>({
      purpose: "concept",
      system: FORGE_SYSTEM_PROMPT,
      user: `Create one original Meme culture experiment from this approved assessment.\n<assessment>${JSON.stringify({ assessment, topic, evidence: signals })}</assessment>`,
      schemaName: "nowlore_meme_concept",
      schema: MemeConceptSchema,
      fallback: () => mockConcept(topic, assessment, signals),
    });
    const now = isoNow(this.clock);
    const end = new Date(this.clock.now().getTime() + concept.experimentWindowHours * 3_600_000).toISOString();
    const sequence = Math.max(0, ...Object.values(snapshot.projects).map((project) => project.sequence)) + 1;
    const base = {
      ...concept,
      id: createId("project"), sequence, slug: `${slugify(concept.name)}-${String(sequence).padStart(3, "0")}`,
      topicId, assessmentId: assessment.id, signalIds: topic.signalIds,
      experimentStartsAt: now, experimentEndsAt: end,
      disclaimers: [STANDARD_DISCLAIMER], network: this.network, quoteMint: "SOL", teamAllocation: "0", creatorInitialBuy: "0",
      status: "draft" as const, revision: 1, createdAt: now, updatedAt: now,
    };
    const project: Project = { ...base, contentHash: computeProjectContentHash(base) };
    await this.store.transact((state) => {
      state.projects[project.id] = project;
      appendAudit(state, {
        actorType: "system", actorId, action: "project.created", entityType: "project", entityId: project.id,
        occurredAt: now, requestId, details: { topicId, assessmentId: assessment.id, promptVersion: CONCEPT_PROMPT_VERSION, contentHash: project.contentHash },
      });
    });
    return project;
  }
}

function latestAssessment(assessments: Record<string, Assessment>, topicId: string): Assessment | undefined {
  return Object.values(assessments).filter((item) => item.topicId === topicId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function assertDesignable(assessment: Assessment): void {
  const scores = assessment.scores;
  const blocking = assessment.riskFlags.some((flag) => BLOCKING_FLAG.test(flag));
  if (assessment.recommendation !== "design" || scores.legal >= 70 || scores.safety >= 70 || scores.brand >= 80 || blocking) {
    throw new AppError("ASSESSMENT_BLOCKED", "Assessment does not pass deterministic design gates", 409, {
      recommendation: assessment.recommendation,
      legal: scores.legal, safety: scores.safety, brand: scores.brand,
    });
  }
}

function mockConcept(topic: Topic, assessment: Assessment, signals: Signal[]): MemeConcept {
  const tokens = keywords(topic.canonicalTitle);
  const lead = (tokens[0] ?? "MOMENT").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const symbol = (lead || "NOW").slice(0, 10);
  const name = `${titleCase(lead || "Moment")} Lore`.slice(0, 32);
  return {
    name,
    symbol,
    tagline: "A timestamp for the internet's current obsession.",
    thesis: assessment.narrative,
    description: `${assessment.summary} This token is a transparent, short-cycle cultural experiment by NOWLORE, supported by ${signals.length} recorded public signal(s).`,
    visualPrompt: `Editorial risograph poster about ${topic.canonicalTitle}; bold geometric symbol, radar pulse, archival timestamp, two-color ink, no logos, no real-person likeness.`,
    websiteCopy: `Why now: ${assessment.summary}\nWindow: approximately ${assessment.expectedWindowHours} hours.\nThis is culture, not a promise of value.`,
    socialDrafts: [
      `${name} / $${symbol} — a NOWLORE short-cycle culture experiment. Sources, wallet and creator fees are public.`,
      `Mint the moment. Keep the record. ${topic.canonicalTitle}`,
    ],
    riskDisclosures: [...new Set(["The topic may lose attention rapidly.", ...assessment.riskFlags])],
    experimentWindowHours: assessment.expectedWindowHours,
  };
}

function titleCase(input: string): string {
  return input.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
