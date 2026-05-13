import { randomUUID } from "node:crypto";
import type { CheckEvaluation, KnowledgeGraph, KnowledgeNode, LessonCard, StudentProfile } from "../types.js";

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);

export function fallbackGraph(topic: string, _profile: StudentProfile): KnowledgeGraph {
  const base = slug(topic) || "topic";
  const labels = [
    `What ${topic} is`,
    "Core idea",
    "Tiny example",
    "Common mix-up",
    "Use it yourself",
    "Final connection"
  ];
  const nodes: KnowledgeNode[] = labels.map((label, index) => {
    const id = `${base}_${index + 1}`;
    return {
      id,
      topicName: label,
      teachingGoal: `Build a calm understanding of ${label.toLowerCase()}.`,
      prerequisites: index === 0 ? [] : [`${base}_${index}`],
      nextCandidates: index === labels.length - 1 ? [] : [`${base}_${index + 2}`],
      sourceTags: [],
      keyTerms: [topic],
      readinessCheck: {
        id: `${id}_ready`,
        nodeId: id,
        kind: "readiness",
        prompt: `Have you seen ${label.toLowerCase()} before?`,
        expectedIdea: label,
        pressureLevel: "low",
        evaluationMode: "semantic"
      },
      comfortCheck: {
        id: `${id}_comfort`,
        nodeId: id,
        kind: "comfort",
        prompt: `In your own words, what is the main idea here?`,
        expectedIdea: label,
        acceptableResponses: [topic],
        pressureLevel: "low",
        evaluationMode: "semantic"
      },
      microLessonPlan: {
        intuition: `${label} is one stepping stone in understanding ${topic}.`,
        example: `Imagine explaining ${topic} to a friend using one small example.`,
        practiceStyle: "one short check"
      },
      commonConfusions: ["mixing the name with the purpose"],
      teachingHints: ["use a concrete example first"],
      repairStrategies: [{ confusion: "idea feels too abstract", action: "give_example" }],
      status: index === 0 ? "active" : index === 1 ? "ready" : "locked",
      mastery: 0,
      evidence: [],
      mission: {
        title: index === labels.length - 1 ? "Final connection" : label,
        goal: `Make ${label.toLowerCase()} feel usable.`,
        reward: index === labels.length - 1 ? "The map clicks together." : "A new block lights up."
      },
      type: index === labels.length - 1 ? "application" : "core"
    };
  });

  return {
    id: randomUUID(),
    topic,
    sourcePacketIds: [],
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      source: nodes[index].id,
      target: node.id,
      relation: "prerequisite",
      reason: "linear MVP learning path"
    }))
  };
}

export function fallbackCards(node: KnowledgeNode): LessonCard[] {
  return [
    {
      id: `${node.id}_explain`,
      type: "text_explain",
      nodeId: node.id,
      title: node.topicName,
      body: `${node.microLessonPlan.intuition}\n\n${node.microLessonPlan.example}`,
      emphasis: node.keyTerms.slice(0, 3)
    },
    {
      id: `${node.id}_check`,
      type: "mcq",
      nodeId: node.id,
      prompt: node.comfortCheck.prompt,
      options: [
        { id: "a", text: node.comfortCheck.expectedIdea },
        { id: "b", text: "A detail that sounds related but is not the main idea", misconceptionId: "near_miss" },
        { id: "c", text: "I want a gentler example first", misconceptionId: "needs_example" }
      ],
      correctOptionId: "a",
      feedback: {
        correct: "Nice. That block is warming up.",
        incorrectGeneric: "This path is getting steep. I found a gentler stepping stone."
      }
    }
  ];
}

export function fallbackCardForType(node: KnowledgeNode, type: string, index: number): LessonCard {
  const id = `${node.id}_fallback_${index + 1}`;
  switch (type) {
    case "recap":
      return { id, type: "recap", nodeId: node.id, title: node.topicName, bullets: [node.teachingGoal, node.microLessonPlan.intuition, "Next: practice this idea."] };
    case "mcq":
      return {
        id, type: "mcq", nodeId: node.id,
        prompt: node.comfortCheck.prompt,
        options: [
          { id: "a", text: node.comfortCheck.expectedIdea },
          { id: "b", text: "A related but different idea" },
          { id: "c", text: "I need more explanation first" }
        ],
        correctOptionId: "a",
        feedback: { correct: "That tracks.", incorrectGeneric: "Not quite. Take another look." },
        phase: "exit"
      };
    case "fill_blank": {
      const term = node.keyTerms[0] ?? node.topicName;
      return { id, type: "fill_blank", nodeId: node.id, prompt: `The key concept here is _____.`, beforeBlank: "The key concept here is", afterBlank: ".", acceptedAnswers: [term] };
    }
    case "true_false":
      return { id, type: "true_false", nodeId: node.id, statement: node.teachingGoal, correctAnswer: true };
    case "analogy":
      return { id, type: "analogy", nodeId: node.id, title: node.topicName, familiar: { name: "something you already know", desc: "A concept from everyday life." }, target: { name: node.topicName, desc: node.teachingGoal }, mapping: "They share a similar structure." };
    case "story":
      return { id, type: "story", nodeId: node.id, title: node.topicName, beats: [node.microLessonPlan.intuition, node.microLessonPlan.example, "And that is the core idea."] };
    case "vocab": {
      const word = node.keyTerms[0] ?? node.topicName;
      return { id, type: "vocab", nodeId: node.id, word, phonetic: "", syllables: word.split(/[\s-]+/), meaning: node.teachingGoal, example: node.microLessonPlan.example };
    }
    case "visual":
      return { id, type: "visual", nodeId: node.id, title: node.topicName, diagram: "generic", parts: [{ id: "main", name: node.topicName, desc: node.teachingGoal }] };
    case "connection":
      return { id, type: "connection", nodeId: node.id, previous: "What you learned before", current: node.topicName, bridge: node.microLessonPlan.intuition };
    case "flash":
      return { id, type: "flash", nodeId: node.id, cards: [{ front: node.keyTerms[0] ?? node.topicName, back: node.teachingGoal }] };
    case "dragsort":
      return { id, type: "dragsort", nodeId: node.id, prompt: "Arrange these steps in order.", steps: { step_a: "First step", step_b: "Second step", step_c: "Third step" }, correct: ["step_a", "step_b", "step_c"], shuffled: ["step_c", "step_a", "step_b"], explanation: "This is the logical order." };
    default:
      return { id, type: "text_explain", nodeId: node.id, title: node.topicName, body: `${node.microLessonPlan.intuition}\n\n${node.microLessonPlan.example}`, emphasis: node.keyTerms.slice(0, 3) };
  }
}

export function fallbackEvaluation(answer: string): CheckEvaluation {
  const text = String(answer ?? "").toLowerCase();
  if (!text.trim()) return { result: "unclear", confidence: 0.4, evidence: "No answer text yet." };
  if (/\b(idk|don't know|confused|lost|hint|help)\b/.test(text)) {
    return { result: "partial", confidence: 0.7, evidence: "Learner asked for support.", detectedIssue: "needs a gentler example" };
  }
  return { result: "pass", confidence: 0.55, evidence: "Learner engaged with the idea." };
}
