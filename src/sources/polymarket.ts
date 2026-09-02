import { z } from "zod";
import { RawSignalSchema, type RawSignal } from "../domain/schemas.js";
import { fetchWithLimits } from "../lib/http.js";
import { cleanText } from "../lib/text.js";
import type { SourceAdapter, SourceContext } from "./types.js";

const MarketSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  question: z.string(),
  slug: z.string().optional(),
  description: z.string().optional().nullable(),
  volume: z.union([z.string(), z.number()]).optional(),
  volume24hr: z.union([z.string(), z.number()]).optional(),
  liquidity: z.union([z.string(), z.number()]).optional(),
  createdAt: z.string().optional(),
  endDate: z.string().optional().nullable(),
  tags: z.array(z.union([z.string(), z.object({ label: z.string().optional() })])).optional(),
}).passthrough();

export class PolymarketSource implements SourceAdapter {
  readonly id = "polymarket";

  constructor(private readonly baseUrl: string) {}

  async fetch(context: SourceContext): Promise<RawSignal[]> {
    const url = new URL(`${this.baseUrl}/markets`);
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("limit", String(context.maxItems));
    url.searchParams.set("order", "volume24hr");
    url.searchParams.set("ascending", "false");
    const response = await fetchWithLimits(url.toString(), { timeoutMs: context.timeoutMs });
    const markets = z.array(MarketSchema).parse(await response.json());
    return markets.map((market): RawSignal => {
      const tagNames = (market.tags ?? []).flatMap((tag) => typeof tag === "string" ? [tag] : tag.label ? [tag.label] : []);
      const publishedAt = safeDate(market.createdAt, context.now);
      const marketUrl = market.slug ? `https://polymarket.com/event/${market.slug}` : `https://polymarket.com/market/${market.id}`;
      return RawSignalSchema.parse({
        source: this.id,
        sourceType: "polymarket",
        externalId: market.id,
        title: cleanText(market.question),
        summary: cleanText(market.description ?? ""),
        url: marketUrl,
        publishedAt,
        metrics: {
          volume: numberOrZero(market.volume),
          volume24hr: numberOrZero(market.volume24hr),
          liquidity: numberOrZero(market.liquidity),
        },
        tags: [...tagNames, ...(market.endDate ? [`ends:${market.endDate}`] : [])],
      });
    });
  }
}

function numberOrZero(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function safeDate(value: string | undefined, fallback: Date): string {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}
