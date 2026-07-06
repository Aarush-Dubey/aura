import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import {
  validateBody,
  generateLessonSchema,
  nodeCardsSchema,
  chatAskSchema,
  reviewAnswerSchema,
} from "../src/api/validation.js";

/** Minimal express req/res doubles that capture status + json + mutated body. */
function invoke(schema: Parameters<typeof validateBody>[0], body: unknown) {
  const req = { body } as Request;
  let statusCode = 200;
  let payload: any = undefined;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      payload = data;
      return this;
    },
  } as unknown as Response;
  const next = vi.fn();
  validateBody(schema)(req, res, next);
  return { statusCode, payload, nextCalled: next.mock.calls.length > 0, req };
}

describe("validateBody middleware", () => {
  it("passes valid input through and calls next()", () => {
    const r = invoke(generateLessonSchema, { topic: "CPU basics", intent: { depth: "intro" } });
    expect(r.nextCalled).toBe(true);
    expect(r.statusCode).toBe(200);
  });

  it("rejects a missing required field with 400 and issue details", () => {
    const r = invoke(nodeCardsSchema, { sessionId: "s1" }); // nodeId missing
    expect(r.nextCalled).toBe(false);
    expect(r.statusCode).toBe(400);
    expect(r.payload.error).toBe("Invalid request body");
    expect(r.payload.issues.some((i: any) => i.path === "nodeId")).toBe(true);
  });

  it("rejects empty question and blank-after-trim strings", () => {
    expect(invoke(chatAskSchema, { question: "   " }).statusCode).toBe(400);
    expect(invoke(chatAskSchema, { question: "why?" }).nextCalled).toBe(true);
  });

  it("strips unknown keys (e.g. the client's language field) from the body", () => {
    const r = invoke(nodeCardsSchema, { sessionId: "s1", nodeId: "n1", language: "es" });
    expect(r.nextCalled).toBe(true);
    expect(r.req.body).toEqual({ sessionId: "s1", nodeId: "n1" });
    expect("language" in (r.req.body as object)).toBe(false);
  });

  it("accepts ratings 1-4 and rejects out-of-range ratings", () => {
    for (const rating of [1, 2, 3, 4]) {
      expect(invoke(reviewAnswerSchema, { rating }).nextCalled).toBe(true);
    }
    expect(invoke(reviewAnswerSchema, { rating: 5 }).statusCode).toBe(400);
    expect(invoke(reviewAnswerSchema, { rating: 0 }).statusCode).toBe(400);
  });
});
