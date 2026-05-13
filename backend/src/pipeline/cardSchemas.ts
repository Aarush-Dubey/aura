import { z } from "zod/v4";
import type { KnowledgeNode, LessonCard } from "../types.js";

// --- Zod schemas per card type ---

const mcqOptionSchema = z.object({
  id: z.string(),
  text: z.string()
});

const mcqSchema = z.object({
  id: z.string(),
  type: z.literal("mcq"),
  nodeId: z.string(),
  prompt: z.string().min(1),
  options: z.array(mcqOptionSchema).length(3),
  correctOptionId: z.string(),
  feedback: z.object({ correct: z.string(), incorrectGeneric: z.string() }),
  phase: z.enum(["entry", "reflect", "exit"]).optional()
});

const fillBlankSchema = z.object({
  id: z.string(),
  type: z.literal("fill_blank"),
  nodeId: z.string(),
  prompt: z.string(),
  beforeBlank: z.string(),
  afterBlank: z.string(),
  acceptedAnswers: z.array(z.string()).min(1),
  hint: z.string().optional()
});

const trueFalseSchema = z.object({
  id: z.string(),
  type: z.literal("true_false"),
  nodeId: z.string(),
  statement: z.string().min(1),
  correctAnswer: z.boolean()
});

const recapSchema = z.object({
  id: z.string(),
  type: z.literal("recap"),
  nodeId: z.string(),
  title: z.string(),
  bullets: z.array(z.string()).min(1).max(4)
});

const analogySchema = z.object({
  id: z.string(),
  type: z.literal("analogy"),
  nodeId: z.string(),
  title: z.string(),
  familiar: z.object({ name: z.string(), desc: z.string() }),
  target: z.object({ name: z.string(), desc: z.string() }),
  mapping: z.string()
});

const storySchema = z.object({
  id: z.string(),
  type: z.literal("story"),
  nodeId: z.string(),
  title: z.string(),
  beats: z.array(z.string()).min(1).max(6)
});

const vocabSchema = z.object({
  id: z.string(),
  type: z.literal("vocab"),
  nodeId: z.string(),
  word: z.string().min(1),
  phonetic: z.string(),
  syllables: z.array(z.string()),
  meaning: z.string().min(1),
  example: z.string()
});

const visualSchema = z.object({
  id: z.string(),
  type: z.literal("visual"),
  nodeId: z.string(),
  title: z.string(),
  diagram: z.string(),
  parts: z.array(z.object({ id: z.string(), name: z.string(), desc: z.string() }))
});

const connectionSchema = z.object({
  id: z.string(),
  type: z.literal("connection"),
  nodeId: z.string(),
  previous: z.string(),
  current: z.string(),
  bridge: z.string()
});

const flashSchema = z.object({
  id: z.string(),
  type: z.literal("flash"),
  nodeId: z.string(),
  cards: z.array(z.object({ front: z.string(), back: z.string() })).min(1)
});

const dragsortSchema = z.object({
  id: z.string(),
  type: z.literal("dragsort"),
  nodeId: z.string(),
  prompt: z.string(),
  steps: z.record(z.string(), z.string()),
  shuffled: z.array(z.string()),
  correct: z.array(z.string()),
  explanation: z.string()
});

const textExplainSchema = z.object({
  id: z.string(),
  type: z.literal("text_explain"),
  nodeId: z.string(),
  title: z.string(),
  body: z.string().min(1),
  emphasis: z.array(z.string()).optional()
});

const schemaByType: Record<string, z.ZodType> = {
  mcq: mcqSchema,
  fill_blank: fillBlankSchema,
  true_false: trueFalseSchema,
  recap: recapSchema,
  analogy: analogySchema,
  story: storySchema,
  vocab: vocabSchema,
  visual: visualSchema,
  connection: connectionSchema,
  flash: flashSchema,
  dragsort: dragsortSchema,
  text_explain: textExplainSchema
};

// --- Coercion: try to fix common Gemma shape mistakes ---

function splitToArray(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) {
    const byNewline = value.split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (byNewline.length > 1) return byNewline;
    const bySentence = value.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean);
    if (bySentence.length > 1) return bySentence;
    return [value.trim()];
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value).map(String).filter(Boolean);
  }
  return null;
}

function coerceToObject(value: unknown, keys: string[]): Record<string, string> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, string>;
  if (typeof value === "string" && value.trim()) {
    const obj: Record<string, string> = {};
    obj[keys[0] ?? "name"] = value;
    obj[keys[1] ?? "desc"] = "";
    return obj;
  }
  return null;
}

export function coerceCard(raw: Record<string, unknown>, node: KnowledgeNode, index: number): Record<string, unknown> {
  const card = { ...raw };
  card.id = String(card.id ?? `${node.id}_gemma_${index + 1}`);
  card.nodeId = node.id;
  const type = String(card.type ?? "text_explain");

  if (type === "mcq") {
    card.prompt = String(card.prompt ?? card.question ?? "");
    if (!Array.isArray(card.options) && card.options && typeof card.options === "object") {
      card.options = Object.entries(card.options).map(([k, v]) => ({ id: k, text: String(v) }));
    }
    if (Array.isArray(card.options)) {
      card.options = (card.options as unknown[]).map((o, i) => {
        if (typeof o === "string") return { id: String.fromCharCode(97 + i), text: o };
        const obj = o as Record<string, unknown>;
        return { id: String(obj.id ?? String.fromCharCode(97 + i)), text: String(obj.text ?? obj.value ?? "") };
      }).filter((o: { text: string }) => o.text.trim());
    }
    card.correctOptionId = String(card.correctOptionId ?? card.answer ?? "a");
    if (!card.feedback || typeof card.feedback !== "object") {
      card.feedback = { correct: "", incorrectGeneric: "" };
    }
    card.phase = ["entry", "reflect", "exit"].includes(String(card.phase)) ? card.phase : "exit";
  }

  if (type === "fill_blank") {
    card.prompt = String(card.prompt ?? "");
    card.beforeBlank = String(card.beforeBlank ?? "");
    card.afterBlank = String(card.afterBlank ?? "");
    const accepted = splitToArray(card.acceptedAnswers);
    if (accepted?.length) card.acceptedAnswers = accepted;
    else if (typeof card.answer === "string") card.acceptedAnswers = [card.answer];
    else card.acceptedAnswers = card.acceptedAnswers ?? [];
  }

  if (type === "true_false") {
    card.statement = String(card.statement ?? card.prompt ?? card.question ?? "");
    if (typeof card.correctAnswer !== "boolean") {
      card.correctAnswer = String(card.correctAnswer ?? card.answer ?? "true").toLowerCase() === "true";
    }
  }

  if (type === "recap") {
    const bullets = splitToArray(card.bullets ?? card.points ?? card.summary ?? card.items);
    card.bullets = bullets?.slice(0, 4) ?? [];
    card.title = String(card.title ?? card.heading ?? "");
    if (!(card.bullets as unknown[]).length && card.body) {
      card.bullets = splitToArray(card.body) ?? [];
    }
  }

  if (type === "analogy") {
    card.title = String(card.title ?? "");
    card.familiar = coerceToObject(card.familiar, ["name", "desc"]) ?? { name: "", desc: "" };
    card.target = coerceToObject(card.target, ["name", "desc"]) ?? { name: "", desc: "" };
    card.mapping = String(card.mapping ?? "");
    const fam = card.familiar as Record<string, unknown>;
    fam.desc = String(fam.desc ?? fam.description ?? "");
    const tgt = card.target as Record<string, unknown>;
    tgt.desc = String(tgt.desc ?? tgt.description ?? "");
  }

  if (type === "story") {
    card.title = String(card.title ?? "");
    const beats = splitToArray(card.beats);
    card.beats = beats?.slice(0, 6) ?? [];
  }

  if (type === "vocab") {
    card.word = String(card.word ?? card.term ?? "");
    card.phonetic = String(card.phonetic ?? "");
    card.meaning = String(card.meaning ?? card.definition ?? "");
    card.example = String(card.example ?? "");
    const syls = splitToArray(card.syllables);
    if (syls && !syls.every(s => ["syl", "la", "bles"].includes(s))) {
      card.syllables = syls;
    } else {
      card.syllables = card.word ? String(card.word).split(/[\s-]+/).filter(Boolean) : [];
    }
  }

  if (type === "visual") {
    card.title = String(card.title ?? "");
    card.diagram = String(card.diagram ?? "generic");
    if (Array.isArray(card.parts)) {
      card.parts = (card.parts as unknown[]).map(p => {
        const part = p as Record<string, unknown>;
        return { id: String(part.id ?? part.name ?? ""), name: String(part.name ?? ""), desc: String(part.desc ?? part.description ?? "") };
      });
    } else {
      card.parts = [];
    }
  }

  if (type === "connection") {
    card.previous = String(card.previous ?? card.from ?? "");
    card.current = String(card.current ?? card.to ?? "");
    card.bridge = String(card.bridge ?? "");
  }

  if (type === "flash") {
    if (!Array.isArray(card.cards) && card.front && card.back) {
      card.cards = [{ front: String(card.front), back: String(card.back) }];
    } else if (Array.isArray(card.cards)) {
      card.cards = (card.cards as unknown[]).map(c => {
        const fc = c as Record<string, unknown>;
        return { front: String(fc.front ?? fc.term ?? ""), back: String(fc.back ?? fc.definition ?? "") };
      });
    } else {
      card.cards = [];
    }
  }

  if (type === "dragsort") {
    card.prompt = String(card.prompt ?? card.question ?? "");
    card.steps = (card.steps && typeof card.steps === "object" && !Array.isArray(card.steps))
      ? Object.fromEntries(Object.entries(card.steps as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
      : {};
    const steps = card.steps as Record<string, string>;
    card.correct = Array.isArray(card.correct) ? card.correct.map(String) : Object.keys(steps);
    card.shuffled = Array.isArray(card.shuffled) ? card.shuffled.map(String) : [...(card.correct as string[])].sort(() => Math.random() - 0.5);
    card.explanation = String(card.explanation ?? "");
  }

  if (type === "text_explain" || !Object.keys(schemaByType).includes(type)) {
    card.type = "text_explain";
    card.title = String(card.title ?? card.heading ?? "");
    card.body = String(card.body ?? card.content ?? card.text ?? card.explanation ?? "");
    if (!card.emphasis || !Array.isArray(card.emphasis)) {
      card.emphasis = node.keyTerms.slice(0, 5);
    }
  }

  return card;
}

// --- Validate with Zod ---

export type CardParseResult =
  | { ok: true; card: LessonCard }
  | { ok: false; errors: string[]; raw: Record<string, unknown> };

export function parseCard(raw: Record<string, unknown>, node: KnowledgeNode, index: number): CardParseResult {
  const coerced = coerceCard(raw, node, index);
  const type = String(coerced.type ?? "text_explain");
  const schema = schemaByType[type] ?? textExplainSchema;
  const result = schema.safeParse(coerced);
  if (result.success) return { ok: true, card: result.data as LessonCard };
  const errors = result.error.issues.map(issue => {
    const path = issue.path.join(".");
    return `${path}: ${issue.message}`;
  });
  return { ok: false, errors, raw: coerced };
}

// --- Format Zod errors for LLM repair prompt ---

export function formatRepairPrompt(raw: Record<string, unknown>, errors: string[], cardType: string): { system: string; user: string } {
  return {
    system: [
      "You are Gemma 4 fixing a malformed lesson card.",
      "The previous output failed schema validation.",
      "Fix ONLY the fields listed in the validation errors.",
      "Do not change fields that are already correct.",
      "Return valid JSON only with a single top-level key named card."
    ].join("\n"),
    user: JSON.stringify({
      task: "Fix the validation errors in this card and return a corrected version.",
      cardType,
      previousOutput: raw,
      validationErrors: errors,
      instruction: "Return { \"card\": { ...corrected card } }. Fix each listed error. Keep all other fields unchanged."
    })
  };
}
