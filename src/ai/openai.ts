import { z } from "zod";
import { HttpAiProvider, type HttpAiOptions } from "./http-provider.js";
import { chatOutputText, responseOutputText } from "./json.js";
import type { AiDescriptor, StructuredRequest } from "./types.js";

export class OpenAiResponsesProvider extends HttpAiProvider {
  constructor(options: HttpAiOptions) { super(options); }

  descriptor(): AiDescriptor {
    return { protocol: "openai-responses", providerName: new URL(this.options.baseUrl).hostname, model: this.options.model };
  }

  protected async requestText<T>(request: StructuredRequest<T>): Promise<string> {
    const payload = await this.post("/responses", { authorization: `Bearer ${this.options.apiKey}` }, {
      model: this.options.model,
      instructions: request.system,
      input: request.user,
      max_output_tokens: this.options.maxOutputTokens,
      temperature: this.options.temperature,
      text: {
        format: {
          type: "json_schema",
          name: request.schemaName,
          strict: true,
          schema: z.toJSONSchema(request.schema),
        },
      },
    });
    return responseOutputText(payload);
  }
}

export class OpenAiChatProvider extends HttpAiProvider {
  constructor(options: HttpAiOptions) { super(options); }

  descriptor(): AiDescriptor {
    return { protocol: "openai-chat", providerName: new URL(this.options.baseUrl).hostname, model: this.options.model };
  }

  protected async requestText<T>(request: StructuredRequest<T>): Promise<string> {
    const payload = await this.post("/chat/completions", { authorization: `Bearer ${this.options.apiKey}` }, {
      model: this.options.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: `${request.user}\n\nReturn only JSON matching this schema:\n${JSON.stringify(z.toJSONSchema(request.schema))}` },
      ],
      max_tokens: this.options.maxOutputTokens,
      temperature: this.options.temperature,
      response_format: { type: "json_object" },
    });
    return chatOutputText(payload);
  }
}
