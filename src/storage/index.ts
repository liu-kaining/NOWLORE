import type { AppConfig } from "../config/env.js";
import { FirestoreStore } from "./firestore-store.js";
import { JsonStore } from "./json-store.js";
import { MemoryStore } from "./memory-store.js";
import type { Store } from "./store.js";

export async function createStore(config: AppConfig): Promise<Store> {
  switch (config.store.driver) {
    case "memory": return new MemoryStore();
    case "json": return JsonStore.open(config.store.jsonPath);
    case "firestore": return new FirestoreStore(config.store.firestoreProjectId, config.store.firestoreDatabaseId);
  }
}

export type { Store } from "./store.js";
export { MemoryStore } from "./memory-store.js";
export { JsonStore } from "./json-store.js";
export { FirestoreStore } from "./firestore-store.js";
