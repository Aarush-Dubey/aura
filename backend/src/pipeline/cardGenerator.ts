import { callLLMJson } from "../llm/json.js";
import { CONFIG } from "../config.js";
import type { KnowledgeNode, LessonCard } from "../types.js";
import { devLog } from "../dev/logs.js";
import { AURA_VOICE_SPEC, auraVoiceSpec, cardTypeVoiceInstruction, finalVoiceReminder, findTutorVoiceViolations } from "../llm/voice.js";
import type { LLMJobType } from "../llm/broker.js";
import { parseCard, formatRepairPrompt } from "./cardSchemas.js";
import { fallbackCardForType } from "./fallbacks.js";
import type { SupportedLanguage } from "../i18n/language.js";
import { LANGUAGE_NAMES } from "../i18n/language.js";

type CardType = "text_explain" | "mcq" | "fill_blank" | "true_false" | "recap" | "analogy" | "story" | "vocab" | "visual" | "connection" | "flash" | "dragsort";

type PlannedCard = {
  type: CardType;
  phase?: "entry" | "reflect" | "exit";
  purpose: string;
};

const ALL_CARD_TYPES: readonly string[] = ["text_explain", "mcq", "fill_blank", "true_false", "recap", "analogy", "story", "vocab", "visual", "connection", "flash", "dragsort"];
const CHECK_CARD_TYPES = new Set<CardType>(["mcq", "fill_blank", "true_false", "dragsort"]);
const TEACHING_CARD_TYPES = new Set<CardType>(["text_explain", "analogy", "story", "vocab", "visual", "connection", "flash"]);

function normalizeCards(rawCards: unknown[], node: KnowledgeNode): LessonCard[] {
  return rawCards.slice(0, 8).map((raw, index) => {
    const card = raw as Record<string, unknown>;
    const inferredType = index === rawCards.length - 1 ? "recap" : "text_explain";
    if (!card.type) card.type = inferredType;
    const result = parseCard(card, node, index);
    if (result.ok) return result.card;
    devLog("warn", "cards", "Coercion applied to card", { nodeId: node.id, index, errors: result.errors });
    return fallbackCardForType(node, String(card.type ?? inferredType), index);
  });
}

const MAX_REPAIR_ATTEMPTS = 2;

async function generateSingleCard(node: KnowledgeNode, index: number, step: PlannedCard, jobType: LLMJobType, language: SupportedLanguage = 'en'): Promise<LessonCard> {
  const p = singleCardPrompt(node, index, step, language);
  let raw: Record<string, unknown> | undefined;
  try {
    const out = await callLLMJson<{ card?: LessonCard; cards?: LessonCard[] }>(p.system, p.user, 0.55, 30_000, 8192, { type: jobType, label: `${node.topicName} card ${index + 1}` });
    raw = (out.card ?? out.cards?.[0]) as Record<string, unknown> | undefined;
  } catch (err) {
    devLog("warn", "cards", "LLM call failed for card", { nodeId: node.id, index, error: String(err) });
  }

  if (!raw) {
    devLog("warn", "cards", "No card returned, using fallback", { nodeId: node.id, index, type: step.type });
    return fallbackCardForType(node, step.type, index);
  }

  if (!raw.type) raw.type = step.type;
  const firstParse = parseCard(raw, node, index);
  if (firstParse.ok) return firstParse.card;

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    devLog("info", "cards", `Self-repair attempt ${attempt}/${MAX_REPAIR_ATTEMPTS}`, { nodeId: node.id, index, errors: firstParse.errors });
    const repair = formatRepairPrompt(firstParse.raw, firstParse.errors, step.type);
    try {
      const repaired = await callLLMJson<{ card?: Record<string, unknown> }>(repair.system, repair.user, 0.15, 15_000, 4096, { type: "repair_card", label: `${node.topicName} card ${index + 1} repair ${attempt}` });
      const repairedCard = repaired.card;
      if (repairedCard) {
        if (!repairedCard.type) repairedCard.type = step.type;
        const reParse = parseCard(repairedCard, node, index);
        if (reParse.ok) {
          devLog("info", "cards", `Self-repair succeeded on attempt ${attempt}`, { nodeId: node.id, index });
          return reParse.card;
        }
      }
    } catch (err) {
      devLog("warn", "cards", "Repair LLM call failed", { nodeId: node.id, index, attempt, error: String(err) });
    }
  }

  devLog("warn", "cards", "All repair attempts failed, using fallback", { nodeId: node.id, index, type: step.type });
  return fallbackCardForType(node, step.type, index);
}

export async function generateCardsForNode(node: KnowledgeNode, jobType: LLMJobType = "current_card", language: SupportedLanguage = 'en'): Promise<LessonCard[]> {
  if (!CONFIG.llmUseForCards) throw new Error("LLM_USE_FOR_CARDS must be true. Lecture cards are Gemma-generated only.");
  devLog("info", "cards", "Generating node lecture with Gemma", { nodeId: node.id, topicName: node.topicName });
  const plan = await planLecture(node, jobType, language);
  devLog("info", "cards", "Gemma planned node lecture", { nodeId: node.id, steps: plan.map((step) => `${step.type}:${step.phase ?? "body"}`) });

  const cards: LessonCard[] = [];
  for (const [index, step] of plan.entries()) {
    devLog("info", "cards", "Generating Gemma lecture card", { nodeId: node.id, card: index + 1, purpose: step.purpose });
    const card = await generateSingleCard(node, index, step, jobType, language);
    cards.push(card);
  }

  const localIssues = localLectureIssues(cards, language);
  if (!localIssues.length) {
    devLog("info", "cards", "Polish skipped: local validators passed", { nodeId: node.id });
    return cards;
  }
  devLog("info", "cards", "Local validators requested Gemma polish", { nodeId: node.id, localIssues });
  return polishLecture(node, cards, language);
}

export async function generateKnowledgeChunkCards(nodes: KnowledgeNode[], language: SupportedLanguage = 'en'): Promise<LessonCard[]> {
  const cards: LessonCard[] = [];
  const batchSize = 2;
  for (let index = 0; index < nodes.length; index += batchSize) {
    const batch = nodes.slice(index, index + batchSize);
    devLog("info", "cards", "Generating Gemma lecture batch", {
      from: index + 1,
      to: index + batch.length,
      total: nodes.length
    });
    for (const node of batch) {
      cards.push(...await generateCardsForNode(node, "current_card", language));
    }
  }
  return cards;
}

async function planLecture(node: KnowledgeNode, jobType: LLMJobType, language: SupportedLanguage = 'en'): Promise<PlannedCard[]> {
  const out = await callLLMJson<{ includeEntryQuestion?: boolean; plan: PlannedCard[] }>(
    [
      "You are Gemma 4 planning a concise node lecture for an adaptive learning app.",
      ...(language !== 'en' ? [`All learner-facing text in the plan must be in ${LANGUAGE_NAMES[language]}.`] : []),
      "Use a variety of card types to keep the learner engaged.",
      "Do not include entry questions. Teach first, check later.",
      "The plan must avoid redundancy. Each card needs a different job.",
      "Return JSON only."
    ].join("\n"),
    JSON.stringify({
      task: "Plan a 5 to 8 card lecture sequence for this node using varied card types.",
      node: nodeBrief(node),
      constraints: [
        "No check card before card 4. The first 3 cards must teach only.",
        "Do not include entry questions.",
        "Exit question (mcq) is required.",
        "At least one text_explain card is required.",
        "One recap card at the end is required.",
        "IMPORTANT: You MUST include at least one card of type analogy, story, vocab, visual, connection, flash, or dragsort. Do NOT only use text_explain/mcq/recap.",
        "Use at least 3 different card types total in the plan.",
        "Do not plan two cards that explain the same idea in the same way.",
        "Choose card types that fit the content: analogy for abstract ideas, vocab for key terms, story for context, visual for diagrams, flash for memorization, dragsort for sequences, connection when bridging from prior node, fill_blank when a key phrase deserves precise recall, true_false when learners commonly hold a misconception worth checking.",
        "Vary the checks: prefer fill_blank or true_false over a second mcq when you need an extra check, so the lesson does not feel like a string of multiple choice."
      ],
      examplePlan: [
        { type: "text_explain", purpose: "introduce the core idea in 80 to 140 words" },
        { type: "analogy", purpose: "map the idea to something familiar" },
        { type: "vocab", purpose: "teach the key term" },
        { type: "mcq", phase: "exit", purpose: "check understanding" },
        { type: "recap", purpose: "summarize takeaways" }
      ],
      cardTypes: {
        text_explain: "lecture, deeper explanation, misconception guard, or worked example",
        mcq: "reflect or exit question (3 options, one correct), never before card 4",
        fill_blank: "single-sentence cloze with one blank; tests precise recall of a key term or short phrase",
        true_false: "single declarative statement (under 18 words) that is unambiguously true or false; good for misconception checks",
        recap: "final summary with 3 bullets",
        analogy: "maps a familiar concept to the new concept being taught",
        story: "short narrative with 3-5 numbered beats that illustrate the idea",
        vocab: "teaches one key term: word, phonetic, syllables, meaning, example sentence",
        visual: "describes a diagram with labeled parts the learner can explore",
        connection: "bridges from a previously learned idea to the current one",
        flash: "2-4 term/definition flashcards for quick memorization",
        dragsort: "3-5 steps the learner must arrange in the correct order"
      },
      schema: {
        includeEntryQuestion: "boolean",
        plan: [{ type: "text_explain|mcq|fill_blank|true_false|recap|analogy|story|vocab|visual|connection|flash|dragsort", phase: "reflect|exit (mcq only)", purpose: "specific non-overlapping job" }]
      }
    }),
    0.35,
    30_000,
    8192,
    { type: jobType, label: `${node.topicName} card plan` }
  );
  const rawPlan = Array.isArray(out.plan) ? out.plan : [];
  const sanitized = rawPlan
    .filter((step) => ALL_CARD_TYPES.includes(step.type))
    .slice(0, 8)
    .map((step) => ({
      type: step.type as CardType,
      phase: step.type === "mcq" && ["entry", "reflect", "exit"].includes(String(step.phase)) ? step.phase : undefined,
      purpose: String(step.purpose ?? "")
    })) as PlannedCard[];
  let ordered = enforceNoEarlyChecks(sanitized);
  if (!ordered.some((step) => step.type === "mcq" && step.phase === "exit")) {
    ordered.splice(Math.max(3, ordered.length - 1), 0, { type: "mcq", phase: "exit", purpose: "check whether the learner can use the node idea without repeating the lecture wording" });
  }
  if (!ordered.some((step) => step.type === "recap")) {
    ordered.push({ type: "recap", purpose: "summarize only the non-repeated takeaways and next move" });
  }
  if (!ordered.some((step) => step.type === "text_explain")) {
    ordered.unshift({ type: "text_explain", purpose: "introduce the idea with a fresh explanation in 80 to 140 words" });
  }
  const newTypes: CardType[] = ["analogy", "story", "vocab", "visual", "connection", "flash", "dragsort"];
  if (!ordered.some((step) => newTypes.includes(step.type))) {
    const pick = node.keyTerms.length > 0 ? "vocab" as CardType : "analogy" as CardType;
    ordered.splice(Math.min(2, ordered.length), 0, {
      type: pick,
      purpose: pick === "vocab" ? `teach the key term "${node.keyTerms[0]}"` : "map the idea to something the learner already knows"
    });
  }
  return enforceNoEarlyChecks(ordered).slice(0, 8);
}

function enforceNoEarlyChecks(plan: PlannedCard[]): PlannedCard[] {
  const teaching = plan.filter((step) => TEACHING_CARD_TYPES.has(step.type));
  const checks = plan.filter((step) => CHECK_CARD_TYPES.has(step.type));
  const recaps = plan.filter((step) => step.type === "recap");
  while (teaching.length < 3) {
    teaching.push({ type: "text_explain", purpose: "teach one missing prerequisite clearly in 80 to 140 words" });
  }
  return [...teaching.slice(0, 3), ...teaching.slice(3), ...checks, ...recaps].map((step, index) => {
    if (index < 3 && CHECK_CARD_TYPES.has(step.type)) {
      return { type: "text_explain", purpose: step.purpose || "teach before checking" };
    }
    if (step.type === "mcq" && step.phase === "entry") return { ...step, phase: "reflect" };
    return step;
  });
}

function extractCardText(card: LessonCard): string {
  switch (card.type) {
    case "text_explain": return card.body;
    case "recap": return card.bullets.join(" ");
    case "mcq": return `${card.prompt} ${card.options.map((o) => o.text).join(" ")}`;
    case "fill_blank": return `${card.prompt} ${card.acceptedAnswers.join(" ")}`;
    case "true_false": return card.statement;
    case "analogy": return `${card.title} ${card.familiar.desc} ${card.target.desc} ${card.mapping}`;
    case "story": return `${card.title} ${card.beats.join(" ")}`;
    case "vocab": return `${card.word} ${card.meaning} ${card.example}`;
    case "visual": return `${card.title} ${card.parts.map((p) => p.desc).join(" ")}`;
    case "connection": return `${card.previous} ${card.current} ${card.bridge}`;
    case "flash": return card.cards.map((c) => `${c.front} ${c.back}`).join(" ");
    case "dragsort": return `${card.prompt} ${Object.values(card.steps).join(" ")} ${card.explanation}`;
    default: return JSON.stringify(card);
  }
}

function localLectureIssues(cards: LessonCard[], language: SupportedLanguage = 'en') {
  const issues: string[] = [];
  if (cards.length < 4 || cards.length > 8) issues.push("card_count");
  if (cards.slice(0, 3).some((card) => ["mcq", "fill_blank", "true_false", "dragsort"].includes(card.type))) issues.push("early_check");
  if (!cards.some((card) => card.type === "recap")) issues.push("missing_recap");
  if (cards.filter((card) => card.type === "mcq" && card.phase === "exit").length !== 1) issues.push("exit_question_count");
  const textBodies = cards.map(extractCardText);
  const normalized = textBodies.map((body) => body.toLowerCase().replace(/\s+/g, " ").trim());
  if (new Set(normalized).size !== normalized.length) issues.push("duplicate_body");
  if (findTutorVoiceViolations(cards, language).length) issues.push("voice_violation");
  if (textBodies.some((body) => /[^\n.!?]{180,}[.!?]/.test(body))) issues.push("long_sentence");
  if (cards.some((card) => isTeachingCard(card) && extractCardText(card).split(/\s+/).filter(Boolean).length < 45)) issues.push("too_short");
  if (language !== "en" && textBodies.some((body) => mostlyLatin(body))) issues.push("language_mismatch");
  return issues;
}

function isTeachingCard(card: LessonCard) {
  return ["text_explain", "analogy", "story", "visual", "connection"].includes(card.type);
}

function mostlyLatin(text: string) {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return letters > 40 && latin / letters > 0.55;
}

function nodeBrief(node: KnowledgeNode) {
  return {
    id: node.id,
    topicName: node.topicName,
    teachingGoal: node.teachingGoal,
    keyTerms: node.keyTerms,
    commonConfusions: node.commonConfusions,
    teachingHints: node.teachingHints,
    microLessonPlan: node.microLessonPlan,
    evidence: node.evidence,
    comfortCheck: { prompt: node.comfortCheck.prompt, expectedIdea: node.comfortCheck.expectedIdea }
  };
}

function cardSchema(node: KnowledgeNode, step: PlannedCard): Record<string, unknown> {
  const base = { id: "snake_case", nodeId: node.id };
  switch (step.type) {
    case "mcq":
      return { card: { ...base, type: "mcq", phase: step.phase, prompt: "string", options: [{ id: "a", text: "string" }, { id: "b", text: "string" }, { id: "c", text: "string" }], correctOptionId: "a|b|c", feedback: { correct: "string", incorrectGeneric: "string" } } };
    case "fill_blank":
      return { card: { ...base, type: "fill_blank", prompt: "Full sentence with one blank shown as _____", beforeBlank: "text before the blank", afterBlank: "text after the blank", acceptedAnswers: ["primary answer", "synonym or variant"], hint: "optional one-sentence hint" } };
    case "true_false":
      return { card: { ...base, type: "true_false", statement: "A single declarative statement under 18 words that is unambiguously true or false.", correctAnswer: true } };
    case "recap":
      return { card: { ...base, type: "recap", title: "string", bullets: ["string", "string", "string"] } };
    case "analogy":
      return { card: { ...base, type: "analogy", title: "short title for the analogy", familiar: { name: "familiar concept name", desc: "1-2 sentence description" }, target: { name: "new concept name", desc: "1-2 sentence description" }, mapping: "one sentence explaining how they connect" } };
    case "story":
      return { card: { ...base, type: "story", title: "short narrative title", beats: ["beat 1 text", "beat 2 text", "beat 3 text"] } };
    case "vocab":
      return { card: { ...base, type: "vocab", word: "the key term", phonetic: "pronunciation guide", syllables: ["syl", "la", "bles"], meaning: "clear definition", example: "example sentence using the word" } };
    case "visual":
      return { card: { ...base, type: "visual", title: "diagram title", diagram: "generic", parts: [{ id: "part_1", name: "Part name", desc: "what this part does" }] } };
    case "connection":
      return { card: { ...base, type: "connection", previous: "concept already learned", current: "new concept being taught", bridge: "1-2 sentences showing how they relate" } };
    case "flash":
      return { card: { ...base, type: "flash", cards: [{ front: "term or question", back: "answer or definition" }] } };
    case "dragsort":
      return { card: { ...base, type: "dragsort", prompt: "Put these steps in order", steps: { step_a: "First step description", step_b: "Second step description", step_c: "Third step description" }, correct: ["step_a", "step_b", "step_c"], shuffled: ["step_c", "step_a", "step_b"], explanation: "why this order matters" } };
    default:
      return { card: { ...base, type: "text_explain", title: "string", body: "2 to 4 short paragraphs separated by blank lines", emphasis: ["string"] } };
  }
}

function singleCardPrompt(node: KnowledgeNode, index: number, step: PlannedCard, language: SupportedLanguage = 'en') {
  return {
    system: [
      auraVoiceSpec(language),
      "",
      "You are Gemma 4 generating one local lesson card for a desktop learning app.",
      "Generate the actual teaching content yourself from the supplied node/source data.",
      "Do not use generic template wording. Do not mention UI, buttons, JSON, or app mechanics.",
      "Use plain conversational language. Examples before formulas. Short paragraphs.",
      cardTypeVoiceInstruction(step.type, step.phase),
      finalVoiceReminder(),
      "Return valid JSON only, with a single top-level key named card."
    ].join("\n"),
    user: JSON.stringify({
      task: "Generate exactly one lecture card for the node.",
      cardNumber: index + 1,
      cardPurpose: step.purpose,
      requiredType: step.type,
      requiredPhase: "phase" in step ? step.phase : null,
      node: nodeBrief(node),
      antiRedundancy: [
        "Do not repeat the same metaphor used by earlier planned cards unless this card's purpose is the worked example.",
        "Do not restate the teachingGoal as the whole card.",
        "Add new information, a new angle, or a useful check."
      ],
      lengthRules: {
        teachingCards: "80 to 140 words in the selected language",
        analogyStoryVisualConnection: "at least 3 meaningful sentences",
        recap: "3 bullets; each bullet is a complete sentence",
        checks: "question is short; feedback explanation is clear and specific"
      },
      requiredShape: cardSchema(node, step)
    })
  };
}

async function polishLecture(node: KnowledgeNode, draftCards: LessonCard[], language: SupportedLanguage = 'en'): Promise<LessonCard[]> {
  devLog("info", "cards", "Gemma judging lecture redundancy", { nodeId: node.id, cards: draftCards.length });
  const out = await callLLMJson<{ cards: LessonCard[]; notes?: string[] }>(
    [
      auraVoiceSpec(language),
      "",
      "You are Gemma 4 acting as an editor and redundancy judge for a node lecture.",
      "Rewrite the full card sequence so it feels cohesive, non-repetitive, and useful.",
      "Preserve the card types and phases unless a phase is absent. The exit mcq must remain an exit mcq.",
      "Remove duplicate metaphors, duplicate definitions, repeated option meanings, and recap bullets that merely restate card titles.",
      "Titles must not repeat the same phrase across cards. If the node phrase appears in one title, use a different angle in the next title.",
      "If a metaphor is used in one card, later cards should move to procedure, example, misconception, or transfer instead of repeating the metaphor.",
      "Entry question is optional: if it repeats the exit question or intro, remove it.",
      "Do not hardcode or template. Rewrite with fresh teaching language from the node data.",
      finalVoiceReminder(),
      "Return valid JSON only."
    ].join("\n"),
    JSON.stringify({
      task: "Judge and rewrite this node lecture for redundancy and final polish.",
      node: nodeBrief(node),
      draftCards,
      outputRules: [
        "Return 4 to 6 cards.",
        "The first 3 cards must be teaching cards, not checks.",
        "Must include at least two text_explain cards.",
        "Must include exactly one exit mcq.",
        "Must include one recap.",
        "May omit entry mcq if not useful.",
        "Every mcq must have 3 plausible options with non-duplicate meanings.",
        "Teaching cards must be 80 to 140 words in the selected language."
      ],
      schema: { cards: "LessonCard[]", notes: ["short editor note"] }
    }),
    0.35,
    30_000,
    8192,
    { type: "polish", label: `${node.topicName} polish` }
  );
  if (!Array.isArray(out.cards) || out.cards.length < 4) {
    devLog("warn", "cards", "Polish returned too few cards, keeping originals", { nodeId: node.id, count: Array.isArray(out.cards) ? out.cards.length : 0 });
    return draftCards;
  }
  let polished = normalizeCards(out.cards, node);
  const exitCount = polished.filter((card) => card.type === "mcq" && card.phase === "exit").length;
  if (exitCount !== 1) {
    devLog("warn", "cards", "Polish returned wrong exit count, keeping originals", { nodeId: node.id, exitCount });
    return draftCards;
  }
  const voiceViolations = findTutorVoiceViolations(polished, language);
  if (voiceViolations.length) {
    devLog("warn", "cards", "Gemma lecture voice violations detected; rewriting", { nodeId: node.id, voiceViolations });
    polished = await rewriteVoiceViolations(node, polished, voiceViolations, language);
  }
  devLog("info", "cards", "Gemma polished lecture", { nodeId: node.id, cards: polished.length, notes: out.notes ?? [] });
  return polished;
}

async function rewriteVoiceViolations(node: KnowledgeNode, cards: LessonCard[], violations: string[], language: SupportedLanguage = 'en'): Promise<LessonCard[]> {
  const out = await callLLMJson<{ cards: LessonCard[]; notes?: string[] }>(
    [
      auraVoiceSpec(language),
      "",
      "You are Gemma 4 rewriting tutor cards only to fix voice, readability, and banned-phrase violations.",
      "Preserve teaching meaning, card ids, card types, mcq phases, option count, correctOptionId, and recap structure.",
      "Do not add new cards. Do not remove the exit question.",
      "Keep questions direct and feedback process-focused.",
      finalVoiceReminder(),
      "Return valid JSON only."
    ].join("\n"),
    JSON.stringify({
      task: "Rewrite the cards to satisfy Aura's tutor voice specification.",
      node: nodeBrief(node),
      violations,
      cards,
      schema: { cards: "same LessonCard[] shape and order", notes: ["short rewrite note"] }
    }),
    0.2,
    30_000,
    8192,
    { type: "voice_rewrite", label: `${node.topicName} voice rewrite` }
  );
  if (!Array.isArray(out.cards) || out.cards.length !== cards.length) return cards;
  const rewritten = normalizeCards(out.cards, node);
  const remaining = findTutorVoiceViolations(rewritten, language);
  if (remaining.length) devLog("warn", "cards", "Gemma voice rewrite still has violations", { nodeId: node.id, remaining });
  return rewritten;
}
