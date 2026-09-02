import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseStateSchema, emptyDatabaseState, type DatabaseState } from "../domain/schemas.js";
import { MemoryStore } from "./memory-store.js";
import type { StoreHealth } from "./store.js";

export class JsonStore extends MemoryStore {
  override readonly driver: string = "json";
  private constructor(private readonly filePath: string, initialState: DatabaseState) {
    super(initialState);
  }

  static async open(filePath: string): Promise<JsonStore> {
    const absolutePath = resolve(filePath);
    let initial = emptyDatabaseState();
    try {
      const contents = await readFile(absolutePath, "utf8");
      initial = DatabaseStateSchema.parse(JSON.parse(contents));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
    const store = new JsonStore(absolutePath, initial);
    await mkdir(dirname(absolutePath), { recursive: true });
    if (!(await store.exists())) await store.afterCommit(initial);
    return store;
  }

  private async exists(): Promise<boolean> {
    try {
      await stat(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  protected override async afterCommit(state: DatabaseState): Promise<void> {
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.filePath);
  }

  override async health(): Promise<StoreHealth> {
    try {
      await stat(this.filePath);
      return { ok: true, driver: this.driver };
    } catch (error) {
      return { ok: false, driver: this.driver, details: (error as Error).message };
    }
  }
}
