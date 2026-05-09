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

export function fallbackEvaluation(answer: string): CheckEvaluation {
  const text = String(answer ?? "").toLowerCase();
  if (!text.trim()) return { result: "unclear", confidence: 0.4, evidence: "No answer text yet." };
  if (/\b(idk|don't know|confused|lost|hint|help)\b/.test(text)) {
    return { result: "partial", confidence: 0.7, evidence: "Learner asked for support.", detectedIssue: "needs a gentler example" };
  }
  return { result: "pass", confidence: 0.55, evidence: "Learner engaged with the idea." };
}
