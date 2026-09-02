import type { AuditEvent, DatabaseState } from "./schemas.js";
import { createId } from "../lib/id.js";
import { canonicalJson, sha256 } from "../lib/hash.js";

export interface AuditInput {
  actorType: AuditEvent["actorType"];
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  requestId?: string | undefined;
  runId?: string | undefined;
  details?: Record<string, unknown>;
}

function payloadForHash(event: Omit<AuditEvent, "payloadHash">): Record<string, unknown> {
  return { ...event };
}

export function appendAudit(state: DatabaseState, input: AuditInput): AuditEvent {
  const previous = state.auditEvents.at(-1);
  const base: Omit<AuditEvent, "payloadHash"> = {
    id: createId("audit"),
    sequence: (previous?.sequence ?? 0) + 1,
    occurredAt: input.occurredAt,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    previousHash: previous?.payloadHash ?? "GENESIS",
    details: input.details ?? {},
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
  };
  const event: AuditEvent = { ...base, payloadHash: sha256(payloadForHash(base)) };
  state.auditEvents.push(event);
  return event;
}

export function verifyAuditChain(events: AuditEvent[]): { valid: boolean; invalidSequence?: number } {
  let previousHash = "GENESIS";
  for (const event of events) {
    const { payloadHash, ...base } = event;
    const validHash = sha256(JSON.parse(canonicalJson(base)));
    if (event.previousHash !== previousHash || payloadHash !== validHash) {
      return { valid: false, invalidSequence: event.sequence };
    }
    previousHash = payloadHash;
  }
  return { valid: true };
}
