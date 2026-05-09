export type StudentIntent = {
  goalType: "exam" | "curiosity" | "application" | "foundation";
  timeHorizon: "single_session" | "week" | "month";
  depthPreference: "intuition_only" | "working_knowledge" | "deep_mechanical";
};

export type GoalMode = "beginner_intro" | "catch_up" | "practice" | "application";
export type NodeStatus = "locked" | "ready" | "active" | "shaky" | "mastered" | "skipped" | "blocked" | "deferred";
export type SourceConfidence = "high" | "medium" | "low";

export type SoftCheck = {
  id: string;
  nodeId: string;
  kind: "readiness" | "comfort" | "review" | "repair";
  prompt: string;
  expectedIdea: string;
  acceptableResponses?: string[];
  misconceptionTargets?: string[];
  pressureLevel: "low" | "medium";
  evaluationMode: "semantic";
};

export type CheckEvaluation = {
  result: "pass" | "partial" | "fail" | "unclear";
  confidence: number;
  evidence: string;
  detectedIssue?: string;
  demonstratedMisconception?: string;
};

export type KnowledgeNode = {
  id: string;
  topicName: string;
  teachingGoal: string;
  prerequisites: string[];
  nextCandidates: string[];
  sourceTags: string[];
  keyTerms: string[];
  readinessCheck: SoftCheck;
  comfortCheck: SoftCheck;
  microLessonPlan: {
    intuition: string;
    example: string;
    visualIdea?: string;
    practiceStyle: string;
  };
  commonConfusions: string[];
  teachingHints: string[];
  repairStrategies: { confusion: string; action: "reexplain" | "insert_prerequisite" | "split_node" | "give_example"; suggestedNode?: string }[];
  status: NodeStatus;
  mastery: number;
  evidence: string[];
  mission?: { title: string; goal: string; reward: string };
  aliases?: string[];
  parentNodeId?: string;
  returnNodeId?: string;
  type?: "core" | "repair" | "bridge" | "practice" | "application" | "curiosity" | "compression";
};

export type GraphEdge = {
  source: string;
  target: string;
  relation: "prerequisite" | "related" | "application" | "repair";
  reason: string;
};

export type KnowledgeGraph = {
  id: string;
  topic: string;
  sourcePacketIds: string[];
  nodes: KnowledgeNode[];
  edges: GraphEdge[];
};

export type LessonPath = {
  graphId: string;
  items: { nodeId: string; deliveryMode: "full" | "compressed_refresh" | "practice" | "repair" | "application"; required: boolean; reason: string }[];
  currentIndex: number;
  skippedNodeIds: string[];
  insertedNodeIds: string[];
  reasonByNodeId: Record<string, string>;
};

export type StudentProfile = {
  id: string;
  readingMode: "standard" | "short_chunks";
  pace: "slow" | "medium" | "fast";
  dyslexiaMode: boolean;
  adhdSupport: boolean;
  prefers: string[];
  avoid: string[];
  strengths: string[];
  struggles: string[];
  topicConfidence: Record<string, "low" | "medium" | "high">;
  recentPatterns: { confusionTriggers: string[]; helpfulStrategies: string[] };
  conceptMastery: Record<string, unknown>;
  spacedReviews: unknown[];
};

export type LessonCard =
  | { id: string; type: "text_explain"; nodeId: string; title: string; body: string; emphasis?: string[]; spokenText?: string }
  | { id: string; type: "mcq"; nodeId: string; prompt: string; options: { id: string; text: string; misconceptionId?: string }[]; correctOptionId: string; feedback: { correct: string; incorrectGeneric: string }; phase?: "entry" | "reflect" | "exit" }
  | { id: string; type: "fill_blank"; nodeId: string; prompt: string; beforeBlank: string; afterBlank: string; acceptedAnswers: string[]; hint?: string }
  | { id: string; type: "true_false"; nodeId: string; statement: string; correctAnswer: boolean; misconceptionId?: string }
  | { id: string; type: "recap"; nodeId: string; title: string; bullets: string[]; nextUnlocked?: string[] }
  | { id: string; type: "repair_card"; nodeId: string; misconceptionId: string; title: string; gentleMessage: string; correction: string; retryCardId?: string };

export type MapNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  type: "core" | "repair" | "application" | "boss";
  state: "locked" | "ready" | "active" | "shaky" | "mastered" | "blocked" | "deferred" | "hidden" | "repair";
};

export type MapEdge = {
  from: string;
  to: string;
  state: "inactive" | "available" | "active" | "completed" | "repair" | "hidden";
};

export type MapState = { nodes: MapNode[]; edges: MapEdge[]; activeNodeId: string };

export type GameEvent =
  | { type: "MISSION_STARTED"; nodeId: string; title: string }
  | { type: "MISSION_COMPLETED"; nodeId: string; rewardText: string }
  | { type: "NODE_UNLOCKED"; nodeId: string; reason: string }
  | { type: "SUPPORT_NODE_DISCOVERED"; nodeId: string; parentNodeId: string; reason: string }
  | { type: "NODE_BECAME_SHAKY"; nodeId: string; reason: string };

export type GameState = {
  sessionId: string;
  theme: "block_world" | "constellation" | "minimal";
  activeMissionId?: string;
  nodeVisualStates: Record<string, MapNode["state"]>;
  unlockedNodeIds: string[];
  completedMissionIds: string[];
  discoveredSupportNodeIds: string[];
  finalMissionUnlocked: boolean;
  recentEvents: GameEvent[];
};

export type NodeMissionMetadata = {
  nodeId: string;
  missionTitle: string;
  objective: string;
  rewardText: string;
  missionType: "core" | "repair" | "application" | "review" | "curiosity";
  difficultyTone: "gentle" | "normal" | "stretch";
};

export type CardInteractionEvent = {
  sessionId: string;
  cardId: string;
  nodeId: string;
  eventType: "answer_submitted" | "hint_requested" | "card_completed" | "power_up";
  payload: unknown;
  telemetry: { responseTimeMs: number; hintUsed: boolean; attemptNumber: number };
};
