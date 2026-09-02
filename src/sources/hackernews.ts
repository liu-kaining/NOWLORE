import { z } from "zod";
import { RawSignalSchema, type RawSignal } from "../domain/schemas.js";
import { fetchWithLimits } from "../lib/http.js";
import { cleanText } from "../lib/text.js";
import type { SourceAdapter, SourceContext } from "./types.js";

const ItemSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  url: z.string().url().optional(),
  by: z.string().optional(),
  score: z.number().optional(),
  descendants: z.number().optional(),
  time: z.number().int(),
  type: z.string(),
});

export class HackerNewsSource implements SourceAdapter {
  readonly id = "hackernews";
  private readonly baseUrl = "https://hacker-news.firebaseio.com/v0";

  async fetch(context: SourceContext): Promise<RawSignal[]> {
    const response = await fetchWithLimits(`${this.baseUrl}/topstories.json`, { timeoutMs: context.timeoutMs });
    const ids = z.array(z.number().int()).parse(await response.json()).slice(0, context.maxItems);
    const items = await mapWithConcurrency(ids, 8, async (id) => {
      const itemResponse = await fetchWithLimits(`${this.baseUrl}/item/${id}.json`, { timeoutMs: context.timeoutMs });
      return ItemSchema.nullable().parse(await itemResponse.json());
    });
    return items.flatMap((item): RawSignal[] => {
      if (!item || item.type !== "story") return [];
      const parsed = RawSignalSchema.safeParse({
        source: this.id,
        sourceType: "hackernews",
        externalId: String(item.id),
        title: cleanText(item.title),
        summary: item.by ? `Submitted by ${item.by}` : "",
        url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
        publishedAt: new Date(item.time * 1_000).toISOString(),
        metrics: { score: item.score ?? 0, comments: item.descendants ?? 0 },
        tags: ["technology"],
      });
      return parsed.success ? [parsed.data] : [];
    });
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]!);
    }
  }));
  return results;
}
