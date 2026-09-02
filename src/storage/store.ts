import type { DatabaseState } from "../domain/schemas.js";

export interface StoreHealth {
  ok: boolean;
  driver: string;
  details?: string;
}

export interface Store {
  readonly driver: string;
  snapshot(): Promise<DatabaseState>;
  transact<T>(mutation: (state: DatabaseState) => T | Promise<T>): Promise<T>;
  health(): Promise<StoreHealth>;
  close(): Promise<void>;
}

export function cloneState(state: DatabaseState): DatabaseState {
  return structuredClone(state);
}
