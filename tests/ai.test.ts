import { describe, expect, it } from "vitest";
import { z } from "zod";
import { anthropicOutputText, chatOutputText, parseJsonText, responseOutputText } from "../src/ai/json.js";
import { MockAiProvider } from "../src/ai/mock.js";

describe("AI adapters", () => {
  it("parses supported response shapes", () => {
    expect(responseOutputText({ output: [{ content: [{ type: "output_text", text: "{\"ok\":true}" }] }] })).toContain("true");
    expect(chatOutputText({ choices: [{ message: { content: "hello" } }] })).toBe("hello");
    expect(anthropicOutputText({ content: [{ type: "text", text: "hello" }] })).toBe("hello");
    expect(parseJsonText("```json\n{\"ok\":true}\n```" )).toEqual({ ok: true });
  });

  it("validates mock output against the business schema", async () => {
    const provider = new MockAiProvider();
    const result = await provider.generateStructured({
      purpose: "assessment", system: "", user: "", schemaName: "test", schema: z.object({ ok: z.boolean() }), fallback: () => ({ ok: true }),
    });
    expect(result.ok).toBe(true);
  });
});
