import type { KnowledgeNode, StudentIntent, StudentProfile } from "../types.js";

const NEURODIVERGENT_RULES = [
  "You design lessons for neurodivergent learners (ADHD, dyslexia, anxiety around school).",
  "Hard rules:",
  "- Use plain conversational language. Never use the words: test, quiz, exam, grade, wrong, fail, stupid, easy, obvious.",
  "- Soft checks must sound like a friendly nudge: \"quick vibe check\", \"tiny check\", \"does this click yet\".",
  "- One idea per field. Short sentences. Examples before formulas. No paragraph walls.",
  "- Never invent prerequisite knowledge the learner has not shown.",
  "- Honor the learner's avoid list and reading mode.",
  "Output valid JSON only. No prose, no markdown fences, no commentary."
].join("\n");

function profileBriefing(profile: StudentProfile) {
  return {
    readingMode: profile.readingMode,
    pace: profile.pace,
    dyslexiaMode: profile.dyslexiaMode,
    adhdSupport: profile.adhdSupport,
    prefers: profile.prefers,
    avoid: profile.avoid,
    strengths: profile.strengths,
    struggles: profile.struggles,
    knownConfusionTriggers: profile.recentPatterns?.confusionTriggers ?? [],
    helpfulStrategies: profile.recentPatterns?.helpfulStrategies ?? []
  };
}

export const graphPrompt = (topic: string, profile: StudentProfile, intent?: StudentIntent) => ({
  system: [
    NEURODIVERGENT_RULES,
    "",
    "You are building an adaptive knowledge graph and a linear teaching path: small teachable concepts that flow from prerequisite to payoff.",
    "Use internal reasoning to decide the order, but do not output private chain-of-thought.",
    "Instead, output short structured reasons: orderReason, prerequisiteReason, and learnerFitReason.",
    "Design rules for the graph:",
    "- Produce the requested targetNodeCount. Do not undershoot unless the topic is truly tiny.",
    "- Each concept must be atomic and teachable in 2 to 5 minutes. No chapter-level concepts.",
    "- Order the output list by prerequisite readiness: concept N must be understandable using only concepts 1..N-1.",
    "- Also include dependsOn ids for graph edges. Most nodes depend on one prior node; support/repair nodes may branch from an earlier node.",
    "- Concept 1 is the gentlest entry point and assumes nothing beyond everyday language.",
    "- The final concept is the smallest meaningful payoff — what the learner can DO at the end.",
    "- Every node must stay visibly anchored to the requested topic. Do not drift into generic prerequisites unless the node title clearly connects back to the topic.",
    "- At least 4 node titles must include a topic-specific word or phrase from the requested topic.",
    "- The final two nodes must directly practice or apply the requested topic, not only background skills.",
    "- Adapt the node list to the learner goal, time horizon, depth preference, profile strengths, and profile struggles.",
    "- If the goal is exam/practice, include at least one worked-example or practice node.",
    "- If the goal is application, include a concrete use-case node.",
    "- If depth is intuition_only, avoid advanced mechanics and keep the sequence shorter.",
    "- Include likely missing prerequisites as bridge/support nodes when needed.",
    "- Include one repair node for a likely misconception when useful.",
    "- Include one practice or application node near the end.",
    "- Coverage checklist: entry intuition, vocabulary/terms, representation or sample space, core rule/formula/mechanism, special cases, worked example, misconception repair, guided practice, final application/payoff.",
    "- Each concept must include a real intuition (a mental picture or analogy), a concrete example, and a gentle practice idea.",
    "- commonConfusions must be authentic mistakes a beginner makes, not generic warnings.",
    "- ids are snake_case, unique, and short (1-3 words).",
    "- Do not include source names or citations."
  ].join("\n"),
  user: JSON.stringify({
    task: "Design a comprehensive ordered learning map for the topic below, tuned to this learner's goal and profile.",
    topic,
    intent,
    targetNodeCount: intent?.depthPreference === "intuition_only" ? 8 : intent?.depthPreference === "deep_mechanical" ? 11 : 10,
    learner: profileBriefing(profile),
    fieldGuidance: {
      id: "snake_case unique slug, e.g. 'ratio_basics'",
      topicName: "short human label, max 6 words",
      teachingGoal: "one sentence describing what the learner can DO after this concept; mention the requested topic or a topic-specific term",
      keyTerms: "2 to 5 vocabulary anchors the learner needs to recognize",
      commonConfusions: "1 to 3 specific beginner mistakes (not generic platitudes)",
      intuition: "plain-language mental picture or analogy, 1 to 2 sentences, no jargon",
      example: "one concrete worked example with real numbers or real situation",
      practiceStyle: "a small gentle activity (e.g. 'sort 3 ratios from smallest to largest')",
      dependsOn: "array of earlier concept ids this node requires; empty only for first node",
      nodeType: "core|bridge|repair|practice|application",
      orderReason: "short reason this node belongs at this position; no private chain-of-thought",
      prerequisiteReason: "short reason this node is learnable from earlier nodes",
      learnerFitReason: "short reason this node fits the learner goal/profile"
    },
    schema: {
      concepts: [{
        id: "snake_case",
        topicName: "string",
        teachingGoal: "string",
        keyTerms: ["string"],
        commonConfusions: ["string"],
        intuition: "string",
        example: "string",
        practiceStyle: "string",
        dependsOn: ["earlier_snake_case_id"],
        nodeType: "core|bridge|repair|practice|application",
        orderReason: "string",
        prerequisiteReason: "string",
        learnerFitReason: "string"
      }]
    }
  })
});

export const cardsPrompt = (node: KnowledgeNode) => ({
  system: [
    NEURODIVERGENT_RULES,
    "",
    "You expand one knowledge node into a calm, complete mini-lecture sequence of exactly 6 cards.",
    "Design rules for the card sequence:",
    "- Order matters. Use exactly this arc: (1) mcq entry question, (2) text_explain intro lecture, (3) text_explain deeper explanation, (4) text_explain worked example, (5) mcq exit question, (6) recap.",
    "- The entry question, all lecture wording, the worked example explanation, the exit question, all options, and all feedback must be generated from the node data. Do not use generic template wording.",
    "- Entry question checks the actual concept, not meta wording like 'what should you watch for'.",
    "- Exit question checks whether the learner can carry the node's idea forward.",
    "- Each text_explain body is 2 to 4 short paragraphs separated by blank lines. Aim for full detail without paragraph walls. Examples before formulas.",
    "- mcq cards have exactly 3 options: one correct, two plausible distractors taken from the node's commonConfusions when possible. Distractors must reflect real beginner mistakes, not silly ones.",
    "- mcq phases: first card phase is entry, fifth card phase is exit.",
    "- Feedback strings are warm and specific. The 'correct' message names what clicked. The 'incorrectGeneric' message offers a gentler stepping stone, never blame.",
    "- Recap bullets are 3 short bullets: the main idea, the example anchor, the next move.",
    "- Every card.nodeId equals the active node id. Card ids are snake_case and unique within this sequence.",
    "- Never reference UI, buttons, or app mechanics. Speak only about the idea."
  ].join("\n"),
  user: JSON.stringify({
    task: "Generate every word of a 6-card lecture sequence for this node. Use the node as source material, but write the actual teaching content yourself.",
    node: {
      id: node.id,
      topicName: node.topicName,
      teachingGoal: node.teachingGoal,
      keyTerms: node.keyTerms,
      commonConfusions: node.commonConfusions,
      teachingHints: node.teachingHints,
      microLessonPlan: node.microLessonPlan,
      comfortCheck: { prompt: node.comfortCheck.prompt, expectedIdea: node.comfortCheck.expectedIdea }
    },
    allowedTypes: ["text_explain", "mcq", "recap"],
    cardShapes: {
      text_explain: { id: "snake_case", type: "text_explain", nodeId: node.id, title: "string", body: "string with \\n\\n between short paragraphs", emphasis: ["keyTerm"] },
      mcq: { id: "snake_case", type: "mcq", nodeId: node.id, prompt: "string", options: [{ id: "a|b|c", text: "string" }], correctOptionId: "a|b|c", feedback: { correct: "string", incorrectGeneric: "string" }, phase: "entry|reflect|exit" },
      recap: { id: "snake_case", type: "recap", nodeId: node.id, title: "string", bullets: ["string"] }
    },
    requiredOrder: [
      "mcq phase=entry",
      "text_explain intro lecture",
      "text_explain deeper explanation",
      "text_explain worked example",
      "mcq phase=exit",
      "recap"
    ],
    schema: { cards: "LessonCard[6] exactly in requiredOrder" }
  })
});

export const evaluatePrompt = (expectedIdea: string, answer: string) => ({
  system: [
    "You judge whether a learner's free-text answer demonstrates the expected understanding.",
    "Be generous on wording, strict on the underlying idea.",
    "Rubric:",
    "- pass: the core idea is clearly present, even if phrased loosely or with small slips.",
    "- partial: the learner is on the right track but missing a key piece, or mixed correct and incorrect framing.",
    "- fail: the answer points to the wrong mental model, or contradicts the expected idea.",
    "- unclear: too short, off-topic, or empty to judge.",
    "When result is partial or fail, set detectedIssue to a short tag (e.g. 'reversed_ratio', 'confused_units').",
    "If the answer reveals a specific wrong mental model, also set demonstratedMisconception with one short sentence.",
    "Confidence is 0.0 to 1.0 reflecting how sure you are.",
    "Output valid JSON only."
  ].join("\n"),
  user: JSON.stringify({
    expectedIdea,
    answer,
    schema: {
      result: "pass|partial|fail|unclear",
      confidence: 0.0,
      evidence: "one short sentence pointing to the part of the answer that drove your judgement",
      detectedIssue: "short snake_case tag or null",
      demonstratedMisconception: "one short sentence or null"
    }
  })
});
