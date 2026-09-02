import type { ZodType } from "zod";

export interface AiDescriptor {
  protocol: string;
  providerName: string;
  model: string;
}

export interface StructuredRequest<T> {
  purpose: "assessment" | "concept";
  system: string;
  user: string;
  schemaName: string;
  schema: ZodType<T>;
  fallback: () => T;
}

export interface AiProvider {
  descriptor(): AiDescriptor;
  generateStructured<T>(request: StructuredRequest<T>): Promise<T>;
}
