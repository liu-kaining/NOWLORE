import { appendAudit } from "../domain/audit.js";
import { AppError } from "../domain/errors.js";
import { AssessmentOutputSchema, type Assessment, type AssessmentOutput, type Signal, type Topic } from "../domain/schemas.js";
import { sha256 } from "../lib/hash.js";
import { createId } from "../lib/id.js";
import { isoNow, type Clock, systemClock } from "../lib/time.js";
import type { AiProvider } from "../ai/types.js";
import type { Store } from "../storage/store.js";
import { ASSESSMENT_PROMPT_VERSION, ORACLE_SYSTEM_PROMPT } from "./prompts.js";

export class OracleService {
  constructor(private readonly store: Store, private readonly ai: AiProvider, private readonly clock: Clock = systemClock) {}

  async evaluate(topicId: string, actorId = "oracle", requestId?: string): Promise<Assessment> {
    const snapshot = await this.store.snapshot();
    const topic = snapshot.topics[topicId];
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", "Topic was not found", 404);
    const signals = topic.signalIds.flatMap((id) => snapshot.signals[id] ? [snapshot.signals[id]] : []);
    if (signals.length === 0) throw new AppError("TOPIC_HAS_NO_SIGNALS", "Topic has no evidence", 409);
    const input = { topic, evidence: signals.map(publicEvidence) };
    const inputHash = sha256(input);
    const cached = Object.values(snapshot.assessments).find((item) => item.inputHash === inputHash && item.promptVersion === ASSESSMENT_PROMPT_VERSION);
    if (cached) return cached;

    const output = await this.ai.generateStructured<AssessmentOutput>({
      purpose: "assessment",
      system: ORACLE_SYSTEM_PROMPT,
      user: `Evaluate this topic. Cite evidence IDs in supporting and counter evidence.\n<evidence>${JSON.stringify(input)}</evidence>`,
      schemaName: "nowlore_trend_assessment",
      schema: AssessmentOutputSchema,
      fallback: () => mockAssessment(topic, signals),
    });
    const now = isoNow(this.clock);
    const descriptor = this.ai.descriptor();
    const assessment: Assessment = {
      ...output,
      id: createId("assessment"), topicId, inputHash, promptVersion: ASSESSMENT_PROMPT_VERSION,
      providerProtocol: descriptor.protocol, providerName: descriptor.providerName, model: descriptor.model, createdAt: now,
    };
    await this.store.transact((state) => {
      if (!state.topics[topicId]) throw new AppError("TOPIC_NOT_FOUND", "Topic was removed during evaluation", 409);
      state.assessments[assessment.id] = assessment;
      state.topics[topicId]!.status = "evaluated";
      state.topics[topicId]!.updatedAt = now;
      appendAudit(state, {
        actorType: "system", actorId, action: "topic.evaluated", entityType: "assessment", entityId: assessment.id,
        occurredAt: now, requestId, details: { topicId, recommendation: assessment.recommendation, inputHash, model: descriptor.model },
      });
    });
    return assessment;
  }
}

function publicEvidence(signal: Signal) {
  return { id: signal.id, source: signal.source, title: signal.title, summary: signal.summary, url: signal.url, publishedAt: signal.publishedAt, metrics: signal.metrics };
}

function mockAssessment(topic: Topic, signals: Signal[]): AssessmentOutput {
  const text = `${topic.canonicalTitle} ${signals.map((signal) => `${signal.title} ${signal.summary}`).join(" ")}`.toLowerCase();
  const highRiskTerms = ["death", "dead", "killed", "disaster", "minor", "child", "shooting", "死亡", "遇难", "儿童", "灾难"];
  const riskHits = highRiskTerms.filter((term) => text.includes(term));
  const verifiability = Math.min(100, 35 + topic.sourceCount * 18);
  const risk = riskHits.length > 0 ? 90 : 18;
  const recommendation = risk >= 70 ? "reject" : topic.heuristicScore >= 52 ? "design" : "watch";
  return {
    summary: topic.canonicalTitle,
    narrative: `A time-sensitive internet narrative supported by ${signals.length} observed signal(s) across ${topic.sourceCount} source(s).`,
    audience: inferAudience(signals),
    supportingEvidence: signals.slice(0, 6).map((signal) => `${signal.id}: ${signal.title}`),
    counterEvidence: topic.sourceCount < 2 ? ["Only one independent source is currently represented."] : [],
    scores: {
      memeability: Math.round(topic.heuristicScore), timeliness: Math.round(topic.freshnessScore), verifiability,
      originality: 58, controversy: risk, legal: riskHits.length ? 80 : 22, safety: risk, brand: riskHits.length ? 85 : 20,
    },
    expectedWindowHours: topic.freshnessScore > 70 ? 48 : 96,
    confidence: Math.min(0.9, 0.42 + topic.sourceCount * 0.12),
    riskFlags: riskHits.map((term) => `sensitive-term:${term}`),
    recommendation,
  };
}

function inferAudience(signals: Signal[]): string[] {
  const types = new Set(signals.map((signal) => signal.sourceType));
  const audience = ["internet culture observers"];
  if (types.has("huggingface")) audience.push("AI builders");
  if (types.has("hackernews")) audience.push("technology community");
  if (types.has("polymarket")) audience.push("prediction market community");
  return audience;
}
