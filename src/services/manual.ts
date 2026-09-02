import { z } from "zod";
import { DiscoveryService, normalizeSignal } from "../pipeline/discovery.js";
import type { RawSignal, Signal } from "../domain/schemas.js";
import type { Store } from "../storage/store.js";
import type { Clock } from "../lib/time.js";

export const ManualSignalInputSchema = z.object({
  title: z.string().min(1).max(500),
  summary: z.string().max(4_000).default(""),
  url: z.string().url().max(2_048).refine((value) => new Set(["http:", "https:"]).has(new URL(value).protocol), "Only http and https URLs are allowed"),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  tags: z.array(z.string().max(80)).max(30).default([]),
  metrics: z.record(z.string(), z.number().nonnegative()).default({}),
});

export class ManualSignalService {
  constructor(private readonly store: Store, private readonly clock: Clock) {}

  async ingest(input: z.infer<typeof ManualSignalInputSchema>, actorId: string, requestId?: string): Promise<Signal> {
    const parsed = ManualSignalInputSchema.parse(input);
    const raw: RawSignal = {
      source: `manual:${actorId}`,
      sourceType: "manual",
      title: parsed.title,
      summary: parsed.summary,
      url: parsed.url,
      publishedAt: parsed.publishedAt ?? this.clock.now().toISOString(),
      tags: parsed.tags,
      metrics: parsed.metrics,
    };
    const source = { id: "manual", fetch: async () => [raw] };
    const service = new DiscoveryService(this.store, [source], this.clock);
    await service.run({ timeoutMs: 1_000, maxItems: 1, actorType: "operator", actorId, ...(requestId ? { requestId } : {}) });
    const id = normalizeSignal(raw, this.clock.now().toISOString()).id;
    return (await this.store.snapshot()).signals[id]!;
  }
}
