import { emptyDatabaseState, type DatabaseState } from "../domain/schemas.js";
import { cloneState, type Store, type StoreHealth } from "./store.js";

export class MemoryStore implements Store {
  readonly driver: string = "memory";
  protected state: DatabaseState;
  private queue: Promise<void> = Promise.resolve();

  constructor(initialState: DatabaseState = emptyDatabaseState()) {
    this.state = cloneState(initialState);
  }

  async snapshot(): Promise<DatabaseState> {
    await this.queue;
    return cloneState(this.state);
  }

  async transact<T>(mutation: (state: DatabaseState) => T | Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      const draft = cloneState(this.state);
      const result = await mutation(draft);
      this.state = draft;
      await this.afterCommit(draft);
      return result;
    });
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  protected async afterCommit(_state: DatabaseState): Promise<void> {}

  async health(): Promise<StoreHealth> {
    return { ok: true, driver: this.driver };
  }

  async close(): Promise<void> {
    await this.queue;
  }
}
