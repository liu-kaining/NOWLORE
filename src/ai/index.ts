import type { AppConfig } from "../config/env.js";
import { AnthropicProvider } from "./anthropic.js";
import { MockAiProvider } from "./mock.js";
import { OpenAiChatProvider, OpenAiResponsesProvider } from "./openai.js";
import type { AiProvider } from "./types.js";

export function createAiProvider(config: AppConfig): AiProvider {
  const options = {
    protocol: config.ai.protocol as "openai-responses" | "openai-chat" | "anthropic",
    baseUrl: config.ai.baseUrl,
    model: config.ai.model,
    apiKey: config.ai.apiKey,
    timeoutMs: config.ai.timeoutMs,
    maxOutputTokens: config.ai.maxOutputTokens,
    temperature: config.ai.temperature,
  };
  switch (config.ai.protocol) {
    case "mock": return new MockAiProvider();
    case "openai-responses": return new OpenAiResponsesProvider(options);
    case "openai-chat": return new OpenAiChatProvider(options);
    case "anthropic": return new AnthropicProvider(options);
  }
}

export type { AiProvider, AiDescriptor, StructuredRequest } from "./types.js";
