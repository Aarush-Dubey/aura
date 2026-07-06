import { z } from "zod/v4";
import type { RequestHandler } from "express";

// ---------------------------------------------------------------------------
// HTTP request validation.
//
// cardSchemas.ts already validates untrusted *model output* with zod. This
// applies the same discipline to untrusted *network input*: every mutating
// route parses its body through a schema before the handler runs, so handlers
// receive well-typed data and malformed requests fail fast with a 400 instead
// of coercing silently (`String(undefined)` → "undefined").
// ---------------------------------------------------------------------------

/** Express middleware: validate `req.body` against `schema`, else 400. */
export function validateBody<S extends z.ZodTypeAny>(schema: S): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Invalid request body",
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

// A learner intent is a small, open-ended object; we require it to be present
// and object-shaped without over-constraining the frontend's evolving fields.
const intentSchema = z.record(z.string(), z.unknown());

export const generateLessonSchema = z.object({
  topic: z.string().trim().min(1, "topic is required"),
  intent: intentSchema,
  cacheId: z.string().optional(),
});

export const generateLessonFromImageSchema = z.object({
  imageData: z.string().min(1, "imageData is required"),
  mimeType: z.string().optional(),
  intent: intentSchema,
});

export const nodeCardsSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  nodeId: z.string().min(1, "nodeId is required"),
});

export const tutorRespondSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  studentMessage: z.string(),
});

export const chatAskSchema = z.object({
  sessionId: z.string().optional(),
  question: z.string().trim().min(1, "question is required"),
  cardContext: z
    .object({
      type: z.string().optional(),
      title: z.string().optional(),
      body: z.string().optional(),
    })
    .optional(),
});

export const reviewAnswerSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export const recordAnswerSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  cardId: z.string().min(1, "cardId is required"),
  correct: z.boolean().optional(),
  responseMs: z.number().nonnegative().optional(),
});
