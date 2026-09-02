import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../domain/errors.js";

function tokenFromRequest(request: FastifyRequest): string {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function equalToken(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireToken(expected: string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!equalToken(tokenFromRequest(request), expected)) throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  };
}

export function actorId(request: FastifyRequest): string {
  const value = request.headers["x-operator-id"];
  return typeof value === "string" && value.length <= 120 ? value : "operator";
}
