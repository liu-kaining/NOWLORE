import type { AppConfig } from "../config/env.js";
import { HackerNewsSource } from "./hackernews.js";
import { HuggingFaceSource } from "./huggingface.js";
import { PolymarketSource } from "./polymarket.js";
import { RssSource } from "./rss.js";
import type { SourceAdapter } from "./types.js";

export function createSources(config: AppConfig): SourceAdapter[] {
  const sources: SourceAdapter[] = config.sources.rssFeeds.map((feed, index) => new RssSource(feed, index));
  if (config.sources.polymarketEnabled) sources.push(new PolymarketSource(config.sources.polymarketBaseUrl));
  if (config.sources.hackerNewsEnabled) sources.push(new HackerNewsSource());
  if (config.sources.huggingFaceEnabled) sources.push(new HuggingFaceSource());
  return sources;
}

export type { SourceAdapter, SourceContext } from "./types.js";
