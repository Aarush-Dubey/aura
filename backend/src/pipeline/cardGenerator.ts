import { callLLMJson } from "../llm/json.js";
import { CONFIG } from "../config.js";
import type { KnowledgeNode, LessonCard } from "../types.js";
import { devLog } from "../dev/logs.js";
import { AURA_VOICE_SPEC, cardTypeVoiceInstruction, finalVoiceReminder, findTutorVoiceViolations } from "../llm/voice.js";
import type { LLMJobType } from "../llm/broker.js";

type PlannedCard = {
  type: "text_explain" | "mcq" | "recap";
  phase?: "entry" | "reflect" | "exit";
  purpose: string;
};

function normalizeCards(rawCards: unknown[], node: KnowledgeNode): LessonCard[] {
  return rawCards.slice(0, 6).map((raw, index) => {
    const card = raw as Record<string, unknown>;
    const id = String(card.id ?? `${node.id}_gemma_${index + 1}`);
    const inferredType = index === rawCards.length - 1 ? "recap" : "text_explain";
    const type = String(card.type ?? inferredType);
    if (type === "mcq" && Array.isArray(card.options)) {
      const options = (card.options as Array<{ id?: string; text?: string } | string>).map((option, optionIndex) => ({
        id: typeof option === "string" ? String.fromCharCode(97 + optionIndex) : String(option.id ?? String.fromCharCode(97 + optionIndex)),
        text: typeof option === "string" ? option : String(option.text ?? "")
      })).filter((option) => option.text.trim());
      const prompt = String(card.prompt ?? card.question ?? "");
      if (!prompt || options.length !== 3) throw new Error(`Gemma returned malformed mcq card for ${node.id}`);
      const feedback = (card.feedback ?? {}) as Record<string, unknown>;
      return {
        id,
        type: "mcq",
        nodeId: node.id,
        prompt,
        options,
        correctOptionId: String(card.correctOptionId ?? card.answer ?? options[0].id),
        feedback: {
          correct: String(feedback.correct ?? ""),
          incorrectGeneric: String(feedback.incorrectGeneric ?? "")
        },
        phase: card.phase === "entry" || card.phase === "reflect" || card.phase === "exit" ? card.phase : index === 0 ? "entry" : "exit"
      } satisfies LessonCard;
    }
    if (type === "recap") {
      if (!Array.isArray(card.bullets)) throw new Error(`Gemma returned malformed recap card for ${node.id}`);
      return {
        id,
        type: "recap",
        nodeId: node.id,
        title: String(card.title ?? card.heading ?? ""),
        bullets: card.bullets.map(String).slice(0, 4)
      } satisfies LessonCard;
    }
    const body = String(card.body ?? card.content ?? card.text ?? "");
    if (!body) throw new Error(`Gemma returned malformed text card for ${node.id}`);
    return {
      id,
      type: "text_explain",
      nodeId: node.id,
      title: String(card.title ?? card.heading ?? ""),
      body,
      emphasis: Array.isArray(card.emphasis) ? card.emphasis.map(String).slice(0, 5) : node.keyTerms.slice(0, 5)
    } satisfies LessonCard;
  });
}

export async function generateCardsForNode(node: KnowledgeNode, jobType: LLMJobType = "current_card"): Promise<LessonCard[]> {
  if (!CONFIG.llmUseForCards) throw new Error("LLM_USE_FOR_CARDS must be true. Lecture cards are Gemma-generated only.");
  devLog("info", "cards", "Generating node lecture with Gemma", { nodeId: node.id, topicName: node.topicName });
  const cards: LessonCard[] = [];
  const plan = await planLecture(node, jobType);
  devLog("info", "cards", "Gemma planned node lecture", { nodeId: node.id, steps: plan.map((step) => `${step.type}:${step.phase ?? "body"}`) });
  for (const [index, step] of plan.entries()) {
    devLog("info", "cards", "Generating Gemma lecture card", { nodeId: node.id, card: index + 1, purpose: step.purpose });
    const p = singleCardPrompt(node, index, step);
    const out = await callLLMJson<{ card?: LessonCard; cards?: LessonCard[] }>(p.system, p.user, 0.55, 30_000, 8192, { type: jobType, label: `${node.topicName} card ${index + 1}` });
    const card = out.card ?? out.cards?.[0];
    if (!card) throw new Error(`Gemma did not return a card for ${node.id} step ${index + 1}`);
    cards.push(...normalizeCards([card], node));
  }
  const localIssues = localLectureIssues(cards);
  if (!localIssues.length) {
    devLog("info", "cards", "Polish skipped: local validators passed", { nodeId: node.id });
    return cards;
  }
  devLog("info", "cards", "Local validators requested Gemma polish", { nodeId: node.id, localIssues });
  return polishLecture(node, cards);
}

export async function generateKnowledgeChunkCards(nodes: KnowledgeNode[]): Promise<LessonCard[]> {
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
      cards.push(...await generateCardsForNode(node));
    }
  }
  return cards;
}

async function planLecture(node: KnowledgeNode, jobType: LLMJobType): Promise<PlannedCard[]> {
  const out = await callLLMJson<{ includeEntryQuestion?: boolean; plan: PlannedCard[] }>(
    [
      "You are Gemma 4 planning a concise node lecture.",
      "Decide whether an entry question is useful. Do not include one if it would repeat the exit question or lecture intro.",
      "The plan must avoid redundancy. Each card needs a different job.",
      "Return JSON only."
    ].join("\n"),
    JSON.stringify({
      task: "Plan a 4 to 6 card lecture sequence for this node.",
      node: nodeBrief(node),
      constraints: [
        "Entry question is optional.",
        "Exit question is required.",
        "At least two text_explain cards are required.",
        "One worked example card is required.",
        "One recap card is required.",
        "Do not plan two cards that explain the same idea in the same way."
      ],
      cardTypes: {
        text_explain: "lecture, deeper explanation, misconception guard, or worked example",
        mcq: "entry, reflect, or exit question",
        recap: "final summary"
      },
      schema: {
        includeEntryQuestion: "boolean",
        plan: [{ type: "text_explain|mcq|recap", phase: "entry|reflect|exit optional", purpose: "specific non-overlapping job" }]
      }
    }),
    0.35,
    30_000,
    8192,
    { type: jobType, label: `${node.topicName} card plan` }
  );
  const rawPlan = Array.isArray(out.plan) ? out.plan : [];
  const sanitized = rawPlan
    .filter((step) => ["text_explain", "mcq", "recap"].includes(step.type))
    .slice(0, 6)
    .map((step) => ({
      type: step.type,
      phase: step.type === "mcq" && ["entry", "reflect", "exit"].includes(String(step.phase)) ? step.phase : undefined,
      purpose: String(step.purpose ?? "")
    })) as PlannedCard[];
  if (!sanitized.some((step) => step.type === "mcq" && step.phase === "exit")) {
    sanitized.splice(Math.max(0, sanitized.length - 1), 0, { type: "mcq", phase: "exit", purpose: "check whether the learner can use the node idea without repeating the lecture wording" });
  }
  if (!sanitized.some((step) => step.type === "recap")) {
    sanitized.push({ type: "recap", purpose: "summarize only the non-repeated takeaways and next move" });
  }
  if (sanitized.filter((step) => step.type === "text_explain").length < 2) {
    sanitized.unshift({ type: "text_explain", purpose: "introduce the idea with a fresh explanation and no repeated metaphor" });
    sanitized.splice(1, 0, { type: "text_explain", purpose: "give one concrete worked example that adds new information" });
  }
  return sanitized.slice(0, 6);
}

function localLectureIssues(cards: LessonCard[]) {
  const issues: string[] = [];
  if (cards.length < 4 || cards.length > 6) issues.push("card_count");
  if (!cards.some((card) => card.type === "recap")) issues.push("missing_recap");
  if (cards.filter((card) => card.type === "mcq" && card.phase === "exit").length !== 1) issues.push("exit_question_count");
  const textBodies = cards.map((card) => {
    if (card.type === "text_explain") return card.body;
    if (card.type === "recap") return card.bullets.join(" ");
    if (card.type === "mcq") return `${card.prompt} ${card.options.map((option) => option.text).join(" ")}`;
    return JSON.stringify(card);
  });
  const normalized = textBodies.map((body) => body.toLowerCase().replace(/\s+/g, " ").trim());
  if (new Set(normalized).size !== normalized.length) issues.push("duplicate_body");
  if (findTutorVoiceViolations(cards).length) issues.push("voice_violation");
  if (textBodies.some((body) => /[^\n.!?]{180,}[.!?]/.test(body))) issues.push("long_sentence");
  return issues;
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

function singleCardPrompt(node: KnowledgeNode, index: number, step: PlannedCard) {
  return {
    system: [
      AURA_VOICE_SPEC,
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
      requiredShape: step.type === "mcq"
        ? { card: { id: "snake_case", type: "mcq", nodeId: node.id, phase: step.phase, prompt: "string", options: [{ id: "a", text: "string" }, { id: "b", text: "string" }, { id: "c", text: "string" }], correctOptionId: "a|b|c", feedback: { correct: "string", incorrectGeneric: "string" } } }
        : step.type === "recap"
          ? { card: { id: "snake_case", type: "recap", nodeId: node.id, title: "string", bullets: ["string", "string", "string"] } }
          : { card: { id: "snake_case", type: "text_explain", nodeId: node.id, title: "string", body: "2 to 4 short paragraphs separated by blank lines", emphasis: ["string"] } }
    })
  };
}

async function polishLecture(node: KnowledgeNode, draftCards: LessonCard[]): Promise<LessonCard[]> {
  devLog("info", "cards", "Gemma judging lecture redundancy", { nodeId: node.id, cards: draftCards.length });
  const out = await callLLMJson<{ cards: LessonCard[]; notes?: string[] }>(
    [
      AURA_VOICE_SPEC,
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
        "Must include at least two text_explain cards.",
        "Must include exactly one exit mcq.",
        "Must include one recap.",
        "May omit entry mcq if not useful.",
        "Every mcq must have 3 plausible options with non-duplicate meanings."
      ],
      schema: { cards: "LessonCard[]", notes: ["short editor note"] }
    }),
    0.35,
    30_000,
    8192,
    { type: "polish", label: `${node.topicName} polish` }
  );
  if (!Array.isArray(out.cards) || out.cards.length < 4) throw new Error(`Gemma polish returned too few cards for ${node.id}`);
  let polished = normalizeCards(out.cards, node);
  const exitCount = polished.filter((card) => card.type === "mcq" && card.phase === "exit").length;
  if (exitCount !== 1) throw new Error(`Gemma polish must return exactly one exit question for ${node.id}`);
  const voiceViolations = findTutorVoiceViolations(polished);
  if (voiceViolations.length) {
    devLog("warn", "cards", "Gemma lecture voice violations detected; rewriting", { nodeId: node.id, voiceViolations });
    polished = await rewriteVoiceViolations(node, polished, voiceViolations);
  }
  devLog("info", "cards", "Gemma polished lecture", { nodeId: node.id, cards: polished.length, notes: out.notes ?? [] });
  return polished;
}

async function rewriteVoiceViolations(node: KnowledgeNode, cards: LessonCard[], violations: string[]): Promise<LessonCard[]> {
  const out = await callLLMJson<{ cards: LessonCard[]; notes?: string[] }>(
    [
      AURA_VOICE_SPEC,
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
  const remaining = findTutorVoiceViolations(rewritten);
  if (remaining.length) devLog("warn", "cards", "Gemma voice rewrite still has violations", { nodeId: node.id, remaining });
  return rewritten;
}
