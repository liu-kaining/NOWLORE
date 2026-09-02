import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonStore } from "../src/storage/json-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("JSON store", () => {
  it("serializes concurrent writes and survives a reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nowlore-store-"));
    temporaryDirectories.push(directory);
    const file = join(directory, "state.json");
    const store = await JsonStore.open(file);

    await Promise.all(Array.from({ length: 20 }, (_, index) => store.transact((state) => {
      const id = `run_${index}`;
      state.jobRuns[id] = {
        id,
        kind: "track",
        status: "succeeded",
        startedAt: "2026-09-01T00:00:00.000Z",
        finishedAt: "2026-09-01T00:00:01.000Z",
        counters: { index },
        errors: [],
      };
    })));
    await store.close();

    const reopened = await JsonStore.open(file);
    expect(Object.keys((await reopened.snapshot()).jobRuns)).toHaveLength(20);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await reopened.close();
  });
});
