import { z } from "zod";
import { HttpAiProvider, type HttpAiOptions } from "./http-provider.js";
import { anthropicOutputText } from "./json.js";
import type { AiDescriptor, StructuredRequest } from "./types.js";

export class AnthropicProvider extends HttpAiProvider {
  constructor(options: HttpAiOptions) { super(options); }

  descriptor(): AiDescriptor {
    return { protocol: "anthropic", providerName: new URL(this.options.baseUrl).hostname, model: this.options.model };
  }

  protected async requestText<T>(request: StructuredRequest<T>): Promise<string> {
    const payload = await this.post("/messages", {
      "x-api-key": this.options.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    }, {
      model: this.options.model,
      max_tokens: this.options.maxOutputTokens,
      temperature: this.options.temperature,
      system: request.system,
      messages: [{
        role: "user",
        content: `${request.user}\n\nReturn only JSON matching this schema:\n${JSON.stringify(z.toJSONSchema(request.schema))}`,
      }],
    });
    return anthropicOutputText(payload);
  }
}
