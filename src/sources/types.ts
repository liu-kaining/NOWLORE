import type { RawSignal } from "../domain/schemas.js";

export interface SourceContext {
  timeoutMs: number;
  maxItems: number;
  now: Date;
}

export interface SourceAdapter {
  readonly id: string;
  fetch(context: SourceContext): Promise<RawSignal[]>;
}
