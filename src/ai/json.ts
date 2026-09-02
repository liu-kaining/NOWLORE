import { AppError } from "../domain/errors.js";

export function parseJsonText(input: string): unknown {
  const cleaned = input.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // The normalized error below deliberately omits provider content.
      }
    }
  }
  throw new AppError("AI_INVALID_JSON", "AI provider did not return valid JSON", 502);
}

export function responseOutputText(payload: unknown): string {
  const body = payload as any;
  if (typeof body?.output_text === "string") return body.output_text;
  const fragments = Array.isArray(body?.output)
    ? body.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      .map((item: any) => item?.text)
      .filter((item: unknown): item is string => typeof item === "string")
    : [];
  if (fragments.length > 0) return fragments.join("\n");
  throw new AppError("AI_EMPTY_RESPONSE", "AI provider returned no text output", 502);
}

export function chatOutputText(payload: unknown): string {
  const content = (payload as any)?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content.map((part) => part?.text).filter((part): part is string => typeof part === "string").join("\n");
    if (text) return text;
  }
  throw new AppError("AI_EMPTY_RESPONSE", "AI provider returned no chat content", 502);
}

export function anthropicOutputText(payload: unknown): string {
  const content = (payload as any)?.content;
  if (Array.isArray(content)) {
    const text = content.filter((item) => item?.type === "text").map((item) => item.text).join("\n");
    if (text) return text;
  }
  throw new AppError("AI_EMPTY_RESPONSE", "Anthropic provider returned no text content", 502);
}
