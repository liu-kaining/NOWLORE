import { appendAudit } from "../domain/audit.js";
import { AppError, errorMessage } from "../domain/errors.js";
import { RawSignalSchema, type DatabaseState, type JobRun, type RawSignal, type Signal, type Topic } from "../domain/schemas.js";
import { sha256 } from "../lib/hash.js";
import { createId } from "../lib/id.js";
import { cleanText, jaccard, keywords, normalizeUrl } from "../lib/text.js";
import { isoNow, type Clock, systemClock } from "../lib/time.js";
import type { SourceAdapter } from "../sources/types.js";
import type { Store } from "../storage/store.js";
import { scoreTopic } from "./scoring.js";

export interface DiscoveryOptions {
  timeoutMs: number;
  maxItems: number;
  actorType?: "system" | "scheduler" | "operator";
  actorId?: string;
  requestId?: string;
}

export class DiscoveryService {
  constructor(
    private readonly store: Store,
    private readonly sources: SourceAdapter[],
    private readonly clock: Clock = systemClock,
  ) {}

  async run(options: DiscoveryOptions): Promise<JobRun> {
    const startedAt = isoNow(this.clock);
    const run: JobRun = {
      id: createId("run"),
      kind: "discover",
      status: "running",
      startedAt,
      counters: { sources: this.sources.length, fetched: 0, inserted: 0, topics: 0 },
      errors: [],
      leaseOwner: `${process.pid}`,
      leaseExpiresAt: new Date(this.clock.now().getTime() + 5 * 60_000).toISOString(),
    };
    await this.store.transact((state) => {
      assertNoActiveLease(state, run.kind, startedAt);
      state.jobRuns[run.id] = run;
      appendAudit(state, {
        actorType: options.actorType ?? "system", actorId: options.actorId ?? "discovery", action: "job.started",
        entityType: "jobRun", entityId: run.id, occurredAt: startedAt, requestId: options.requestId,
      });
    });

    const results = await Promise.all(this.sources.map(async (source) => {
      try {
        return {
          source: source.id,
          signals: await source.fetch({ timeoutMs: options.timeoutMs, maxItems: options.maxItems, now: this.clock.now() }),
          error: null,
        };
      } catch (error) {
        return { source: source.id, signals: [] as RawSignal[], error: errorMessage(error).slice(0, 500) };
      }
    }));

    return this.store.transact((state) => {
      const storedRun = state.jobRuns[run.id]!;
      for (const result of results) {
        if (result.error) {
          storedRun.errors.push({ source: result.source, code: "SOURCE_FAILED", message: result.error });
          continue;
        }
        storedRun.counters.fetched = (storedRun.counters.fetched ?? 0) + result.signals.length;
        for (const raw of result.signals) {
          const signal = normalizeSignal(raw, isoNow(this.clock));
          if (state.signals[signal.id]) continue;
          state.signals[signal.id] = signal;
          storedRun.counters.inserted = (storedRun.counters.inserted ?? 0) + 1;
          assignToTopic(state, signal, isoNow(this.clock));
        }
      }
      recomputeTopics(state, isoNow(this.clock));
      storedRun.counters.topics = Object.values(state.topics).filter((topic) => topic.status === "new").length;
      storedRun.status = storedRun.errors.length === 0 ? "succeeded" : storedRun.counters.inserted! > 0 ? "partial" : "failed";
      storedRun.finishedAt = isoNow(this.clock);
      delete storedRun.leaseOwner;
      delete storedRun.leaseExpiresAt;
      appendAudit(state, {
        actorType: options.actorType ?? "system", actorId: options.actorId ?? "discovery", action: "job.finished",
        entityType: "jobRun", entityId: run.id, occurredAt: storedRun.finishedAt, requestId: options.requestId,
        details: { status: storedRun.status, counters: storedRun.counters, errorCount: storedRun.errors.length },
      });
      return structuredClone(storedRun);
    });
  }
}

export function normalizeSignal(input: RawSignal, observedAt: string): Signal {
  const raw = RawSignalSchema.parse(input);
  const url = normalizeUrl(raw.url);
  const normalized = {
    ...raw,
    title: cleanText(raw.title, 500),
    summary: cleanText(raw.summary, 4_000),
    url,
    tags: [...new Set(raw.tags.map((tag) => cleanText(tag, 80)).filter(Boolean))].slice(0, 30),
  };
  const rawHash = sha256(normalized);
  return { ...normalized, id: `sig_${sha256(`${url}|${normalized.title.toLowerCase()}`).slice(0, 24)}`, observedAt, rawHash };
}

function assignToTopic(state: DatabaseState, signal: Signal, now: string): void {
  const signalKeywords = keywords(`${signal.title} ${signal.summary}`);
  const candidate = Object.values(state.topics)
    .filter((topic) => topic.status !== "archived")
    .map((topic) => ({ topic, score: jaccard(signalKeywords, topic.keywords) }))
    .sort((a, b) => b.score - a.score)[0];
  let topic: Topic;
  if (candidate && candidate.score >= 0.28) {
    topic = candidate.topic;
    topic.signalIds.push(signal.id);
    topic.keywords = [...new Set([...topic.keywords, ...signalKeywords])].slice(0, 40);
    topic.updatedAt = now;
  } else {
    topic = {
      id: createId("topic"), canonicalTitle: signal.title, keywords: signalKeywords, signalIds: [signal.id], sourceCount: 1,
      heuristicScore: 0, freshnessScore: 0, engagementScore: 0, diversityScore: 0, velocityScore: 0,
      status: "new", createdAt: now, updatedAt: now,
    };
    state.topics[topic.id] = topic;
  }
  state.signals[signal.id] = { ...signal, topicId: topic.id };
}

function recomputeTopics(state: DatabaseState, now: string): void {
  for (const topic of Object.values(state.topics)) {
    const signals = topic.signalIds.flatMap((id) => state.signals[id] ? [state.signals[id]] : []);
    Object.assign(topic, scoreTopic(signals, now));
    topic.updatedAt = now;
  }
}

function assertNoActiveLease(state: DatabaseState, kind: JobRun["kind"], now: string): void {
  const active = Object.values(state.jobRuns).find((run) => run.kind === kind && run.status === "running" && run.leaseExpiresAt && run.leaseExpiresAt > now);
  if (active) throw new AppError("JOB_ALREADY_RUNNING", `A ${kind} job is already running`, 409, { jobRunId: active.id });
}
