import Parser from "rss-parser";
import { RawSignalSchema, type RawSignal } from "../domain/schemas.js";
import { fetchWithLimits, responseTextLimited } from "../lib/http.js";
import { cleanText } from "../lib/text.js";
import type { SourceAdapter, SourceContext } from "./types.js";

export class RssSource implements SourceAdapter {
  readonly id: string;
  private readonly parser = new Parser();

  constructor(private readonly feedUrl: string, index: number) {
    this.id = `rss-${index + 1}`;
  }

  async fetch(context: SourceContext): Promise<RawSignal[]> {
    const response = await fetchWithLimits(this.feedUrl, { timeoutMs: context.timeoutMs, maxBytes: 2_000_000 });
    const feed = await this.parser.parseString(await responseTextLimited(response));
    return feed.items.slice(0, context.maxItems).flatMap((item): RawSignal[] => {
      const title = cleanText(item.title ?? "");
      const url = item.link ?? item.guid;
      if (!title || !url) return [];
      const published = item.isoDate ?? item.pubDate;
      const parsedDate = published ? new Date(published) : context.now;
      const parsed = RawSignalSchema.safeParse({
        source: this.id,
        sourceType: "rss",
        externalId: item.guid,
        title,
        summary: cleanText(item.contentSnippet ?? item.content ?? ""),
        url,
        publishedAt: Number.isNaN(parsedDate.getTime()) ? context.now.toISOString() : parsedDate.toISOString(),
        metrics: {},
        tags: (item.categories ?? []).map((category) => cleanText(category, 80)).filter(Boolean).slice(0, 30),
      });
      return parsed.success ? [parsed.data] : [];
    });
  }
}
