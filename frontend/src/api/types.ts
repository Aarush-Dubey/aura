export type StudentIntent = {
  goalType: "exam" | "curiosity" | "application" | "foundation";
  timeHorizon: "single_session" | "week" | "month";
  depthPreference: "intuition_only" | "working_knowledge" | "deep_mechanical";
};

export type MapNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  type: "core" | "repair" | "application" | "boss";
  state: "locked" | "ready" | "active" | "shaky" | "mastered" | "blocked" | "deferred" | "hidden" | "repair";
};
export type MapEdge = { from: string; to: string; state: "inactive" | "available" | "active" | "completed" | "repair" | "hidden" };
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
  nodeVisualStates?: Record<string, MapNode["state"]>;
  unlockedNodeIds?: string[];
  completedMissionIds?: string[];
  discoveredSupportNodeIds?: string[];
  finalMissionUnlocked?: boolean;
  recentEvents: GameEvent[];
};
export type KnowledgeNode = {
  id: string;
  topicName: string;
  teachingGoal: string;
  status: string;
  mastery: number;
  evidence: string[];
  keyTerms: string[];
};
export type KnowledgeGraph = {
  id: string;
  topic: string;
  sourcePacketIds: string[];
  nodes: KnowledgeNode[];
  edges: { source: string; target: string; relation: string; reason: string }[];
};
export type LessonPath = {
  graphId: string;
  currentIndex: number;
  items: { nodeId: string; deliveryMode: string; required: boolean; reason: string }[];
  skippedNodeIds: string[];
  insertedNodeIds: string[];
  reasonByNodeId: Record<string, string>;
};
export type LessonCard =
  | { id: string; type: "text_explain"; nodeId: string; title: string; body: string; emphasis?: string[] }
  | { id: string; type: "mcq"; nodeId: string; prompt: string; options: { id: string; text: string }[]; correctOptionId: string; feedback: { correct: string; incorrectGeneric: string }; phase?: "entry" | "reflect" | "exit" }
  | { id: string; type: "fill_blank"; nodeId: string; prompt: string; beforeBlank: string; afterBlank: string; acceptedAnswers: string[]; hint?: string }
  | { id: string; type: "true_false"; nodeId: string; statement: string; correctAnswer: boolean }
  | { id: string; type: "recap"; nodeId: string; title: string; bullets: string[]; nextUnlocked?: string[] }
  | { id: string; type: "repair_card"; nodeId: string; title: string; gentleMessage: string; correction: string; retryCardId?: string; misconceptionId: string };

export type LessonResponse = {
  sessionId: string;
  openingMessage: string;
  graph: KnowledgeGraph;
  lessonPath: LessonPath;
  mapState: MapState;
  cards: LessonCard[];
  gameState: GameState;
  missionMetadata: Record<string, { missionTitle: string; objective: string; rewardText: string; missionType?: string; difficultyTone?: string }>;
  sourceConfidence: "high" | "medium" | "low";
  imageExtraction?: unknown;
};

export type Telemetry = {
  model: string;
  backend: string;
  mtpEnabled: boolean;
  engineState: string;
  activeJob: null | { id: string; type: string; label: string; priority: number };
  queue: { id: string; type: string; label: string; priority: number }[];
  waitingJobs: number;
  pausedJobs: number;
  recentEvents: { at: string; type: string; message: string }[];
  lastJob: null | {
    type: string;
    label: string;
    queueMs: number;
    totalMs: number;
    approximateTtftMs: number;
    approximateTokensPerSecond: number;
    mtp: boolean;
  };
  network: { externalBytes: number; cloudCalls: number };
  memory: { backendRssBytes: number };
  prefetch: { status: string; label: string; updatedAt: string };
};

export type TutorResponse = Partial<LessonResponse> & {
  assistantMessage: string;
  mapState: MapState;
  cards: LessonCard[];
  gameEvents: GameEvent[];
  gameStatePatch?: GameState;
  nodeState?: { nodeId: string; status: string; mastery: number };
};

export type CacheOption = {
  id: string;
  topic: string;
  subject: string;
  gradeLevel: string;
  learningGoals: string[];
  constraints: string[];
  score: number;
  usable: boolean;
};

export type DevLogEntry = {
  at: string;
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  data?: unknown;
};
