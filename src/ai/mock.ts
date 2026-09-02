import type { AiDescriptor, AiProvider, StructuredRequest } from "./types.js";

export class MockAiProvider implements AiProvider {
  descriptor(): AiDescriptor {
    return { protocol: "mock", providerName: "nowlore-deterministic", model: "mock-v1" };
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    return request.schema.parse(request.fallback());
  }
}
