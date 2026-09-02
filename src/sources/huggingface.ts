import { z } from "zod";
import { RawSignalSchema, type RawSignal } from "../domain/schemas.js";
import { fetchWithLimits } from "../lib/http.js";
import type { SourceAdapter, SourceContext } from "./types.js";

const ModelSchema = z.object({
  id: z.string(),
  modelId: z.string().optional(),
  author: z.string().optional(),
  likes: z.number().optional(),
  downloads: z.number().optional(),
  trendingScore: z.number().optional(),
  createdAt: z.string().optional(),
  lastModified: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).passthrough();

export class HuggingFaceSource implements SourceAdapter {
  readonly id = "huggingface";

  async fetch(context: SourceContext): Promise<RawSignal[]> {
    const url = new URL("https://huggingface.co/api/models");
    url.searchParams.set("sort", "trendingScore");
    url.searchParams.set("direction", "-1");
    url.searchParams.set("limit", String(context.maxItems));
    const response = await fetchWithLimits(url.toString(), { timeoutMs: context.timeoutMs });
    const models = z.array(ModelSchema).parse(await response.json());
    return models.map((model): RawSignal => {
      const id = model.modelId ?? model.id;
      const published = model.createdAt ?? model.lastModified;
      const date = published ? new Date(published) : context.now;
      return RawSignalSchema.parse({
        source: this.id,
        sourceType: "huggingface",
        externalId: id,
        title: `${id} is trending on Hugging Face`,
        summary: `Trending AI model${model.author ? ` by ${model.author}` : ""}.`,
        url: `https://huggingface.co/${id}`,
        publishedAt: Number.isNaN(date.getTime()) ? context.now.toISOString() : date.toISOString(),
        metrics: { likes: model.likes ?? 0, downloads: model.downloads ?? 0, trendingScore: model.trendingScore ?? 0 },
        tags: (model.tags ?? []).slice(0, 30),
      });
    });
  }
}
