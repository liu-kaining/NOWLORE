import { describe, expect, it } from "vitest";
import { appendAudit, verifyAuditChain } from "../src/domain/audit.js";
import { emptyDatabaseState } from "../src/domain/schemas.js";

describe("audit hash chain", () => {
  it("detects mutation", () => {
    const state = emptyDatabaseState();
    appendAudit(state, { actorType: "system", actorId: "test", action: "one", entityType: "test", entityId: "1", occurredAt: new Date(0).toISOString() });
    appendAudit(state, { actorType: "system", actorId: "test", action: "two", entityType: "test", entityId: "2", occurredAt: new Date(1).toISOString() });
    expect(verifyAuditChain(state.auditEvents)).toEqual({ valid: true });
    state.auditEvents[0]!.details.changed = true;
    expect(verifyAuditChain(state.auditEvents)).toEqual({ valid: false, invalidSequence: 1 });
  });
});
