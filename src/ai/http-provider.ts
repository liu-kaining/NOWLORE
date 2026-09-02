import { z } from "zod";
import { AppError } from "../domain/errors.js";
import { parseJsonText } from "./json.js";
import type { AiDescriptor, AiProvider, StructuredRequest } from "./types.js";

export interface HttpAiOptions {
  protocol: "openai-responses" | "openai-chat" | "anthropic";
  baseUrl: string;
  model: string;
  apiKey: string | undefined;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
}

export abstract class HttpAiProvider implements AiProvider {
  constructor(protected readonly options: HttpAiOptions) {}

  abstract descriptor(): AiDescriptor;
  protected abstract requestText<T>(request: StructuredRequest<T>): Promise<string>;

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    if (!this.options.apiKey) throw new AppError("AI_NOT_CONFIGURED", "AI API key is not configured", 503);
    const text = await this.requestText(request);
    const result = request.schema.safeParse(parseJsonText(text));
    if (!result.success) {
      throw new AppError("AI_SCHEMA_MISMATCH", "AI response failed structured validation", 502, {
        issues: result.error.issues.slice(0, 8).map((issue) => ({ path: issue.path.join("."), code: issue.code })),
      });
    }
    return result.data;
  }

  protected async post(path: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.options.baseUrl}${path}`, {
      method: "POST",
      signal: AbortSignal.timeout(this.options.timeoutMs),
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      throw new AppError("AI_UPSTREAM_ERROR", `AI provider returned ${response.status}`, 502, {
        status: response.status,
        ...(retryAfter ? { retryAfter } : {}),
      });
    }
    return z.unknown().parse(await response.json());
  }
}
