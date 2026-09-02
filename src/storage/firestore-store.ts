import { Firestore, type CollectionReference, type DocumentData, type Transaction } from "@google-cloud/firestore";
import { DatabaseStateSchema, emptyDatabaseState, type AuditEvent, type DatabaseState } from "../domain/schemas.js";
import { AppError } from "../domain/errors.js";
import { cloneState, type Store, type StoreHealth } from "./store.js";

const MAP_COLLECTIONS = [
  "signals", "topics", "assessments", "projects", "approvals", "launches", "metricSnapshots", "jobRuns",
] as const;
export class FirestoreStore implements Store {
  readonly driver = "firestore";
  private readonly firestore: Firestore;
  private queue: Promise<void> = Promise.resolve();

  constructor(projectId?: string, databaseId = "(default)") {
    this.firestore = new Firestore({ ...(projectId ? { projectId } : {}), databaseId });
  }

  private collection(name: string): CollectionReference<DocumentData> {
    return this.firestore.collection(`nowlore_${name}`);
  }

  private async readWith(transaction?: Transaction): Promise<DatabaseState> {
    const readQuery = async (name: string) => {
      const query = this.collection(name);
      return transaction ? transaction.get(query) : query.get();
    };
    const [meta, ...snapshots] = await Promise.all([
      transaction
        ? transaction.get(this.firestore.doc("nowlore_meta/state"))
        : this.firestore.doc("nowlore_meta/state").get(),
      ...MAP_COLLECTIONS.map(readQuery),
      readQuery("auditEvents"),
    ]);
    const state = emptyDatabaseState();
    if (meta.exists && meta.data()?.schemaVersion !== 1) {
      throw new AppError("UNSUPPORTED_SCHEMA", "Unsupported Firestore schema version", 500);
    }
    MAP_COLLECTIONS.forEach((name, index) => {
      const target = state[name] as Record<string, unknown>;
      for (const document of snapshots[index]!.docs) target[document.id] = document.data();
    });
    const auditSnapshot = snapshots.at(-1)!;
    state.auditEvents = auditSnapshot.docs.map((document) => document.data() as AuditEvent).sort((a, b) => a.sequence - b.sequence);
    return DatabaseStateSchema.parse(state);
  }

  async snapshot(): Promise<DatabaseState> {
    await this.queue;
    return cloneState(await this.readWith());
  }

  async transact<T>(mutation: (state: DatabaseState) => T | Promise<T>): Promise<T> {
    const task = this.queue.then(() => this.firestore.runTransaction(async (transaction) => {
      const before = await this.readWith(transaction);
      const after = cloneState(before);
      const result = await mutation(after);
      DatabaseStateSchema.parse(after);
      let writes = 1;
      transaction.set(this.firestore.doc("nowlore_meta/state"), { schemaVersion: 1, updatedAt: new Date().toISOString() });
      for (const name of MAP_COLLECTIONS) {
        const previous = before[name] as Record<string, unknown>;
        const next = after[name] as Record<string, unknown>;
        const ids = new Set([...Object.keys(previous), ...Object.keys(next)]);
        for (const id of ids) {
          if (!(id in next)) {
            transaction.delete(this.collection(name).doc(id));
            writes += 1;
          } else if (JSON.stringify(previous[id]) !== JSON.stringify(next[id])) {
            transaction.set(this.collection(name).doc(id), next[id] as DocumentData);
            writes += 1;
          }
        }
      }
      const existingAuditIds = new Set(before.auditEvents.map((event) => event.id));
      for (const event of after.auditEvents) {
        if (!existingAuditIds.has(event.id)) {
          transaction.set(this.collection("auditEvents").doc(event.id), event);
          writes += 1;
        }
      }
      if (writes > 490) {
        throw new AppError("FIRESTORE_TRANSACTION_TOO_LARGE", "Transaction would exceed Firestore write limits", 503);
      }
      return result;
    }));
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  async health(): Promise<StoreHealth> {
    try {
      await this.firestore.doc("nowlore_meta/state").get();
      return { ok: true, driver: this.driver };
    } catch (error) {
      return { ok: false, driver: this.driver, details: (error as Error).message };
    }
  }

  async close(): Promise<void> {
    await this.queue;
    await this.firestore.terminate();
  }
}
