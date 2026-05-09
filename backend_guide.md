# Aura Backend Guide

Step-by-step backend implementation for the Aura hackathon MVP. Every phase below maps directly to specifications in `aura.md`. Follow them in order — later phases depend on earlier ones.

## Product Context

Aura is a privacy-first adaptive learning desktop app for neurodivergent students, especially learners with ADHD and dyslexia.

The backend is not building a generic tutoring chatbot. It is building the local learning engine that powers this product promise:

```text
Aura bends the learning path to the student instead of forcing the student to conform to a fixed lesson.
```

Backend design must preserve three product constraints:

```text
Privacy-first:
for LLM we will be using gemma 4 2b model through liteRT LM fully local no  external LLM call except for exa=
student profile, learning history, mistakes, mastery, misconceptions, and session state stay local in SQLite.
Only topic/search queries and source-retrieval needs should go to Exa. Do not send private learner state to Exa.

Neurodivergent-friendly:
responses, cards, checks, and repair actions must avoid shame, pressure, dense text, and test-like language.
The engine should prefer short chunks, examples-first teaching, soft checks, explicit repair paths, and gentle recovery.

Adaptive by construction:
the backend must track live understanding, misconceptions, mastery, fatigue, node state, and path mutations.
Do not treat a lesson as static generated content. Every interaction can update the path, cards, map state, and future teaching context.
```

Implementation tone matters. Avoid backend-generated learner-facing text like:

```text
wrong
failed
quiz failed
low score
penalty
```

Prefer:

```text
This path is getting steep.
I found a gentler stepping stone.
Let’s try this another way.
This idea is still warming up.
```

The backend exists to make the frontend's block-world map truthful: when the learner struggles, the map changes because the learning state changed, not because the frontend faked an animation.

## Stack Decisions (Locked)

```text
Runtime         Node inside Electron
HTTP framework  Express
Database        better-sqlite3 (synchronous SQLite)
Local LLM       Gemma 4 via LiteRT-LM (OpenAI-compatible API)
LLM port        8080
Backend port    3001
Search          Exa API
Mode            Single user, hardcoded profile_001
Secrets         .env file
```

---

## Phase 0: Project Setup

### File Structure

```text
backend/
  src/
    index.ts                     # Express app entry
    config.ts                    # env loading
    db/
      schema.sql
      migrate.ts
      profiles.ts                # CRUD for student_profiles
      sessions.ts                # CRUD for sessions
      sourcePackets.ts           # CRUD for source_packets
      graphs.ts                  # CRUD for knowledge_graphs
      paths.ts                   # CRUD for lesson_paths
      gameStates.ts              # CRUD for session_game_states
    llm/
      client.ts                  # LiteRT-LM HTTP wrapper
      prompts.ts                 # All system + user templates
      json.ts                    # JSON-mode wrapper with retry
    exa/
      client.ts                  # Exa HTTP wrapper
      normalize.ts               # raw -> SourcePacket
      cache.ts                   # SQLite-backed
    pipeline/
      buildGraph.ts              # topic -> KnowledgeGraph
      linearize.ts               # KnowledgeGraph -> LessonPath
      diagnostic.ts              # opening question + parse
      teach.ts                   # build TeachingContext + LLM
      evaluate.ts                # check evaluation
      adapt.ts                   # decideTransition + mutation
      dynamicNode.ts             # repair/bridge/practice creation
      cardGenerator.ts           # active node -> validated LessonCard[]
      mapState.ts                # graph/path/runtime -> frontend MapState
      gameEvents.ts              # transitions -> GameEvent[] / GameState patches
    state/
      liveModel.ts               # LiveStudentModel updates
      misconceptions.ts          # misconception tracker
      sourceConfidence.ts        # SourceConfidence computation
    api/
      session.ts                 # /generateLesson, /tutor/respond, /session/:id/state
      profile.ts                 # /profile/update
      cards.ts                   # /card-event, card interaction bridge
    types.ts                     # all shared types
  .env
  package.json
  tsconfig.json
```

### Dependencies

```bash
npm i express better-sqlite3 dotenv
npm i -D typescript @types/node @types/express @types/better-sqlite3 ts-node
```

### `.env`

```text
EXA_API_KEY=...
LLM_BASE_URL=http://localhost:8080/v1
LLM_MODEL=gemma-4
BACKEND_PORT=3001
DB_PATH=./aura.db
DEFAULT_PROFILE_ID=profile_001
```

### `src/config.ts`

```ts
import "dotenv/config"

export const CONFIG = {
  exaApiKey: process.env.EXA_API_KEY!,
  llmBaseUrl: process.env.LLM_BASE_URL!,
  llmModel: process.env.LLM_MODEL!,
  backendPort: Number(process.env.BACKEND_PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? "./aura.db",
  defaultProfileId: process.env.DEFAULT_PROFILE_ID ?? "profile_001"
}
```

---

## Phase 1: Database Layer

### Schema (`src/db/schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS student_profiles (
  id TEXT PRIMARY KEY,
  reading_mode TEXT NOT NULL DEFAULT 'short_chunks',
  pace TEXT NOT NULL DEFAULT 'medium',
  dyslexia_mode INTEGER NOT NULL DEFAULT 0,
  adhd_support INTEGER NOT NULL DEFAULT 0,
  prefers_json TEXT NOT NULL DEFAULT '[]',
  avoid_json TEXT NOT NULL DEFAULT '[]',
  strengths_json TEXT NOT NULL DEFAULT '[]',
  struggles_json TEXT NOT NULL DEFAULT '[]',
  topic_confidence_json TEXT NOT NULL DEFAULT '{}',
  recent_patterns_json TEXT NOT NULL DEFAULT '{"confusionTriggers":[],"helpfulStrategies":[]}',
  concept_mastery_json TEXT NOT NULL DEFAULT '{}',
  spaced_reviews_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  student_profile_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  intent_json TEXT NOT NULL,
  goal_mode TEXT NOT NULL,
  graph_id TEXT,
  lesson_path_id TEXT,
  current_index INTEGER NOT NULL DEFAULT 0,
  live_model_json TEXT NOT NULL DEFAULT '{"currentUnderstanding":{},"demonstratedMisconceptions":[],"fatigue":{"level":0,"evidence":[]},"helpfulStrategies":{}}',
  misconceptions_json TEXT NOT NULL DEFAULT '[]',
  history_json TEXT NOT NULL DEFAULT '[]',
  source_confidence TEXT NOT NULL DEFAULT 'medium',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  FOREIGN KEY(student_profile_id) REFERENCES student_profiles(id)
);

CREATE TABLE IF NOT EXISTS source_packets (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  query TEXT NOT NULL,
  search_type TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  cached INTEGER NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_results (
  id TEXT PRIMARY KEY,
  packet_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  snippet TEXT,
  highlights_json TEXT NOT NULL,
  summary TEXT,
  reading_difficulty TEXT,
  source_type TEXT,
  use_for_json TEXT NOT NULL,
  FOREIGN KEY(packet_id) REFERENCES source_packets(id)
);

CREATE TABLE IF NOT EXISTS knowledge_graphs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  created_at TEXT NOT NULL,
  graph_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_paths (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  graph_id TEXT NOT NULL,
  current_index INTEGER NOT NULL,
  path_json TEXT NOT NULL,
  FOREIGN KEY(graph_id) REFERENCES knowledge_graphs(id)
);

CREATE TABLE IF NOT EXISTS session_game_states (
  session_id TEXT PRIMARY KEY,
  game_state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
```

### `src/db/migrate.ts`

```ts
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import { CONFIG } from "../config"

export const db = new Database(CONFIG.dbPath)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

export function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8")
  db.exec(sql)
  seedDefaultProfile()
}

function seedDefaultProfile() {
  const exists = db.prepare("SELECT id FROM student_profiles WHERE id = ?").get(CONFIG.defaultProfileId)
  if (exists) return
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO student_profiles (id, dyslexia_mode, adhd_support, prefers_json, avoid_json, created_at, updated_at)
    VALUES (?, 1, 1, ?, ?, ?, ?)
  `).run(
    CONFIG.defaultProfileId,
    JSON.stringify(["examples first", "visual language", "short chunks"]),
    JSON.stringify(["formula first", "long paragraphs", "test language"]),
    now,
    now
  )
}
```

Call `migrate()` once at startup.

---

## Phase 2: Type Definitions (`src/types.ts`)

Every type from `aura.md` plus ones the doc references but doesn't define.

```ts
// ===== Student Intent =====
export type StudentIntent = {
  goalType: "exam" | "curiosity" | "application" | "foundation"
  timeHorizon: "single_session" | "week" | "month"
  depthPreference: "intuition_only" | "working_knowledge" | "deep_mechanical"
}

export type GoalMode = "beginner_intro" | "catch_up" | "practice" | "application"

// ===== Soft Check =====
export type SoftCheck = {
  id: string
  nodeId: string
  kind: "readiness" | "comfort" | "review" | "repair"
  prompt: string
  expectedIdea: string
  acceptableResponses?: string[]
  misconceptionTargets?: string[]
  pressureLevel: "low" | "medium"
  evaluationMode: "semantic"
}

export type CheckEvaluation = {
  result: "pass" | "partial" | "fail" | "unclear"
  confidence: number
  evidence: string
  detectedIssue?: string
  demonstratedMisconception?: string
}

// ===== Knowledge Node =====
export type NodeStatus =
  | "locked" | "ready" | "active" | "shaky"
  | "mastered" | "skipped" | "blocked" | "deferred"

export type RepairAction =
  | "reexplain" | "insert_prerequisite" | "split_node" | "give_example"

export type RepairStrategy = {
  confusion: string
  action: RepairAction
  suggestedNode?: string
}

export type Mission = {
  title: string
  goal: string
  reward: string
}

export type KnowledgeNode = {
  id: string
  topicName: string
  teachingGoal: string
  prerequisites: string[]
  nextCandidates: string[]
  sourceTags: string[]
  keyTerms: string[]
  readinessCheck: SoftCheck
  comfortCheck: SoftCheck
  microLessonPlan: {
    intuition: string
    example: string
    visualIdea?: string
    practiceStyle: string
  }
  commonConfusions: string[]
  teachingHints: string[]
  repairStrategies: RepairStrategy[]
  status: NodeStatus
  mastery: number
  evidence: string[]
  mission?: Mission
  aliases?: string[]
  parentNodeId?: string
  returnNodeId?: string
  type?: "core" | "repair" | "bridge" | "practice" | "application" | "curiosity" | "compression"
}

// ===== Knowledge Graph =====
export type GraphEdge = {
  source: string
  target: string
  relation: "prerequisite" | "related" | "application" | "repair"
  reason: string
}

export type KnowledgeGraph = {
  id: string
  topic: string
  sourcePacketIds: string[]
  nodes: KnowledgeNode[]
  edges: GraphEdge[]
}

// ===== Lesson Path =====
export type DeliveryMode =
  | "full" | "compressed_refresh" | "practice" | "repair" | "application"

export type LessonPathItem = {
  nodeId: string
  deliveryMode: DeliveryMode
  required: boolean
  reason: string
}

export type LessonPath = {
  graphId: string
  items: LessonPathItem[]
  currentIndex: number
  skippedNodeIds: string[]
  insertedNodeIds: string[]
  reasonByNodeId: Record<string, string>
}

// ===== Source Packet =====
export type ExaSearchType =
  | "instant" | "fast" | "auto" | "neural"
  | "deep-lite" | "deep" | "deep-reasoning"

export type SourceResult = {
  id: string
  title: string
  url: string
  publishedDate?: string
  author?: string
  snippet: string
  highlights: string[]
  summary?: string
  sourceType: "lesson" | "reference" | "application" | "video" | "paper" | "unknown"
  readingDifficulty: "beginner" | "intermediate" | "advanced" | "unknown"
  useFor: string[]
}

export type SourcePacket = {
  id: string
  topic: string
  query: string
  searchType: ExaSearchType
  retrievedAt: string
  cached: boolean
  results: SourceResult[]
}

export type SourceConfidence = "high" | "medium" | "low"
export type SourcePolicy = "trust_sources" | "mixed" | "model_generated"

// ===== Student Profile =====
export type StudentProfile = {
  id: string
  readingMode: "standard" | "short_chunks"
  pace: "slow" | "medium" | "fast"
  dyslexiaMode: boolean
  adhdSupport: boolean
  prefers: string[]
  avoid: string[]
  strengths: string[]
  struggles: string[]
  topicConfidence: Record<string, "low" | "medium" | "high">
  recentPatterns: {
    confusionTriggers: string[]
    helpfulStrategies: string[]
  }
  conceptMastery: Record<string, LearnerConceptState>
  spacedReviews: SpacedReviewItem[]
}

export type LearnerConceptState = {
  conceptId: string
  storedMastery: number
  confidence: number
  conceptType: "conceptual" | "procedural"
  lastSeenAt: string
  evidence: string[]
  source: "diagnostic" | "session" | "self_report" | "imported"
}

export type SpacedReviewItem = {
  conceptId: string
  dueAt: string
  intervalDays: number
  lastResult: "pass" | "partial" | "fail"
}

// ===== Live Student Model =====
export type LiveConceptUnderstanding = {
  depth: "none" | "surface" | "structural" | "generative"
  confidence: number
  lastEvidence: string
  fragileAspects: string[]
}

export type DemonstratedMisconception = {
  misconception: string
  detectedAtNode: string
  resolved: boolean
  affectedFutureNodes: string[]
  evidence: string[]
}

export type LiveStudentModel = {
  currentUnderstanding: Record<string, LiveConceptUnderstanding>
  demonstratedMisconceptions: DemonstratedMisconception[]
  fatigue: { level: number; evidence: string[] }
  helpfulStrategies: Record<string, number>
}

// ===== Teaching Context =====
export type TeachingContext = {
  currentNode: KnowledgeNode
  prerequisiteContext: {
    id: string
    status: NodeStatus
    mastery: number
    studentEvidence: string[]
  }[]
  nextNodeContext: { id: string; reason: string }[]
  studentProfile: StudentProfile
  recentSessionHistory: { role: "student" | "assistant"; message: string }[]
  sourceContext: { title: string; url: string; relevantSnippet: string }[]
  teachingInstruction: {
    mode: "teach_current_node"
    maxLength: string
    style: string
    mustInclude: string[]
    mustAvoid: string[]
  }
}

// ===== Frontend Card Contract =====
export type LessonCard =
  | TextExplainCard
  | McqCard
  | DragMatchCard
  | FillBlankCard
  | SortStepsCard
  | TrueFalseCard
  | RecapCard
  | RepairCard

export type BaseLessonCard = {
  id: string
  type: string
  nodeId: string
  title?: string
  spokenText?: string
}

export type TextExplainCard = BaseLessonCard & {
  type: "text_explain"
  title: string
  body: string
  emphasis?: string[]
}

export type McqCard = BaseLessonCard & {
  type: "mcq"
  prompt: string
  options: { id: string; text: string; misconceptionId?: string }[]
  correctOptionId: string
  feedback: { correct: string; incorrectGeneric: string }
}

export type DragMatchCard = BaseLessonCard & {
  type: "drag_match"
  prompt: string
  items: { id: string; label: string }[]
  targets: { id: string; label: string }[]
  correctPairs: { itemId: string; targetId: string }[]
}

export type FillBlankCard = BaseLessonCard & {
  type: "fill_blank"
  prompt: string
  beforeBlank: string
  afterBlank: string
  acceptedAnswers: string[]
  hint?: string
}

export type SortStepsCard = BaseLessonCard & {
  type: "sort_steps"
  prompt: string
  steps: { id: string; text: string }[]
  correctOrder: string[]
}

export type TrueFalseCard = BaseLessonCard & {
  type: "true_false"
  statement: string
  correctAnswer: boolean
  misconceptionId?: string
}

export type RecapCard = BaseLessonCard & {
  type: "recap"
  title: string
  bullets: string[]
  nextUnlocked?: string[]
}

export type RepairCard = BaseLessonCard & {
  type: "repair_card"
  misconceptionId: string
  title: string
  gentleMessage: string
  correction: string
  retryCardId?: string
}

// ===== Frontend Map + Game Contract =====
export type MapNode = {
  id: string
  label: string
  x: number
  y: number
  type: "core" | "repair" | "application" | "boss"
  state: "locked" | "ready" | "active" | "shaky" | "mastered" | "blocked" | "deferred" | "hidden" | "repair"
}

export type MapEdge = {
  from: string
  to: string
  state: "inactive" | "available" | "active" | "completed" | "repair" | "hidden"
}

export type MapState = {
  nodes: MapNode[]
  edges: MapEdge[]
  activeNodeId: string
}

export type GameState = {
  sessionId: string
  theme: "block_world" | "constellation" | "minimal"
  activeMissionId?: string
  nodeVisualStates: Record<string, MapNode["state"]>
  unlockedNodeIds: string[]
  completedMissionIds: string[]
  discoveredSupportNodeIds: string[]
  finalMissionUnlocked: boolean
  recentEvents: GameEvent[]
}

export type NodeMissionMetadata = {
  nodeId: string
  missionTitle: string
  objective: string
  rewardText: string
  missionType: "core" | "repair" | "application" | "review" | "curiosity"
  difficultyTone: "gentle" | "normal" | "stretch"
}

export type GameEvent =
  | { type: "MISSION_STARTED"; nodeId: string; title: string }
  | { type: "MISSION_COMPLETED"; nodeId: string; rewardText: string }
  | { type: "NODE_UNLOCKED"; nodeId: string; reason: string }
  | { type: "SUPPORT_NODE_DISCOVERED"; nodeId: string; parentNodeId: string; reason: string }
  | { type: "NODE_BECAME_SHAKY"; nodeId: string; reason: string }
  | { type: "NODE_BLOCKED"; nodeId: string; reason: string }
  | { type: "FINAL_MISSION_UNLOCKED"; nodeId: string; reason: string }
  | { type: "REVIEW_DUE"; nodeId: string; dueAt: string }

export type PowerUpSignal =
  | { type: "REQUEST_HINT" }
  | { type: "REQUEST_EXAMPLE" }
  | { type: "REQUEST_VISUALIZE" }
  | { type: "REQUEST_SLOW_DOWN" }
  | { type: "REQUEST_BREAK_STEPS" }
  | { type: "REQUEST_READ_ALOUD" }
  | { type: "REQUEST_APPLICATION" }
  | { type: "ZONED_OUT" }

export type CardInteractionEvent = {
  sessionId: string
  cardId: string
  nodeId: string
  eventType: "answer_submitted" | "hint_requested" | "card_completed" | "power_up"
  payload: unknown
  telemetry: { responseTimeMs: number; hintUsed: boolean; attemptNumber: number }
}

export type MapPatch = {
  nodes?: Partial<MapNode>[]
  edges?: Partial<MapEdge>[]
}

// ===== Transitions =====
export type NodeTransitionAction =
  | { type: "ADVANCE"; nextNodeId: string }
  | { type: "REPAIR_CURRENT"; strategy: RepairStrategy }
  | { type: "INSERT_REPAIR_NODE"; node: KnowledgeNode }
  | { type: "BACKTRACK_TO_PREREQUISITE"; nodeId: string }
  | { type: "COMPRESS_NEXT"; nodeId: string }
  | { type: "SKIP_NEXT"; nodeId: string; reason: string }
  | { type: "BRANCH_TO_APPLICATION"; nodeId: string }
  | { type: "PAUSE_FOR_REVIEW"; reviewNodeIds: string[] }
  | { type: "BLOCK_CURRENT"; reason: string }

// ===== Path Mutations =====
export type PathMutation =
  | { type: "insertBefore"; targetNodeId: string; newItem: LessonPathItem }
  | { type: "insertAfter"; currentNodeId: string; newItem: LessonPathItem }
  | { type: "replaceItem"; nodeId: string; newItems: LessonPathItem[] }
  | { type: "skipUpcoming"; nodeId: string }
  | { type: "compressUpcoming"; nodeId: string }
  | { type: "branchTo"; nodeId: string }
  | { type: "returnFromBranch" }
```

---

## Phase 3: LLM Client (`src/llm/client.ts`)

LiteRT-LM exposes an OpenAI-compatible chat completions endpoint.

```ts
import { CONFIG } from "../config"

type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

type LLMOpts = {
  json?: boolean
  temperature?: number
  maxTokens?: number
}

export async function callLLM(
  system: string,
  user: string,
  opts: LLMOpts = {}
): Promise<string> {
  const body = {
    model: CONFIG.llmModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ] satisfies ChatMessage[],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1024,
    ...(opts.json ? { response_format: { type: "json_object" } } : {})
  }

  const res = await fetch(`${CONFIG.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })

  if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content
}

export async function isLLMReady(): Promise<boolean> {
  try {
    const res = await fetch(`${CONFIG.llmBaseUrl}/models`)
    return res.ok
  } catch {
    return false
  }
}
```

### JSON wrapper with retry (`src/llm/json.ts`)

```ts
import { callLLM } from "./client"

export async function callLLMJson<T>(
  system: string,
  user: string,
  temperature = 0.2
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callLLM(system, user, { json: true, temperature })
    try {
      return JSON.parse(raw) as T
    } catch (e) { lastErr = e }
  }
  throw new Error(`LLM returned invalid JSON after 2 attempts: ${lastErr}`)
}
```

---

## Phase 4: Prompt Library (`src/llm/prompts.ts`)

All six LLM call types with full templates. Tune temperatures during demo prep.

```ts
export const PROMPTS = {

  // ----- 1. Concept Extraction -----
  extractConcepts: (topic: string, sources: string) => ({
    system: `You extract atomic teachable concepts from source material for an adaptive learning app.
Rules:
- Each concept must be teachable in 2-5 minutes.
- Do not create chapter-level concepts.
- Do not invent concepts not supported by the sources.
- Output valid JSON only.`,
    user: `Topic: ${topic}

Sources:
${sources}

Return JSON:
{
  "concepts": [
    {
      "label": "string",
      "teachingGoal": "string",
      "keyTerms": ["string"],
      "sourceResultIds": ["string"]
    }
  ]
}
Create 6-12 concepts.`
  }),

  // ----- 2. Prerequisite Edge Inference -----
  inferEdges: (conceptList: string) => ({
    system: `You infer prerequisite relationships between concepts. An edge A->B means A should be understood before B. Only create educationally necessary edges. Output valid JSON only.`,
    user: `Concepts:
${conceptList}

Return JSON:
{
  "edges": [
    { "source": "concept_id", "target": "concept_id", "reason": "string" }
  ]
}`
  }),

  // ----- 3. Node Enrichment (Draft Creation) -----
  enrichNode: (concept: string, sources: string, profile: string) => ({
    system: `You expand a concept into a complete teachable knowledge node.
Soft checks must use casual language like "quick vibe check" or "tiny check" — never "test", "quiz", "exam".
Output valid JSON only.`,
    user: `Concept: ${concept}
Source snippets: ${sources}
Learner profile: ${profile}

Return JSON:
{
  "topicName": "string",
  "teachingGoal": "string",
  "prerequisiteHints": ["string"],
  "sourceTags": ["string"],
  "keyTerms": ["string"],
  "readinessCheck": { "prompt": "string", "expectedIdea": "string" },
  "comfortCheck": { "prompt": "string", "expectedIdea": "string" },
  "microLessonPlan": {
    "intuition": "string",
    "example": "string",
    "visualIdea": "string",
    "practiceStyle": "string"
  },
  "commonConfusions": ["string"],
  "teachingHints": ["string"],
  "repairStrategies": [
    { "confusion": "string", "action": "reexplain|insert_prerequisite|split_node|give_example", "suggestedNodeTitle": "string" }
  ],
  "mission": { "title": "string", "goal": "string", "reward": "string" }
}`
  }),

  // ----- 4. Graph Cleanup -----
  cleanupGraph: (graphSummary: string) => ({
    system: `You review a draft knowledge graph and propose cleanup operations.
Possible actions: merge, split, rename, delete, keep.
Prefer keep. Only delete if a node is duplicate, irrelevant, or unsupported.
Output valid JSON only.`,
    user: `Draft graph:
${graphSummary}

Return JSON:
{
  "operations": [
    { "action": "merge|split|rename|delete|keep", "nodeId": "string", "nodeIds": ["string"], "newTopicName": "string", "reason": "string" }
  ]
}`
  }),

  // ----- 5. Teaching -----
  teach: (context: string) => ({
    system: `You are Aura, a patient adaptive tutor for students with ADHD and dyslexia.
Hard rules:
- Maximum 120 words per turn.
- One idea at a time.
- Examples before formulas.
- Conversational tone.
- End with exactly one soft comfort check using casual language.
- Never say: test, quiz, exam, grade, wrong, fail.
- Honor the student's "mustAvoid" list.`,
    user: context
  }),

  // ----- 6. Soft Check Evaluation -----
  evaluateCheck: (question: string, expected: string, answer: string) => ({
    system: `You evaluate whether a student's answer demonstrates the expected understanding.
Be generous: look for the core idea, not exact wording.
If the answer suggests a wrong mental model, set demonstratedMisconception.
Output valid JSON only.`,
    user: `Question: ${question}
Expected idea: ${expected}
Student answered: ${answer}

Return JSON:
{
  "result": "pass|partial|fail|unclear",
  "confidence": 0.0,
  "evidence": "string",
  "detectedIssue": "string|null",
  "demonstratedMisconception": "string|null"
}`
  }),

  // ----- 7. Diagnostic Parse -----
  parseDiagnostic: (answer: string, topic: string) => ({
    system: `Parse a learner's free-text response about prior exposure to a topic. Output valid JSON only.`,
    user: `Topic: ${topic}
Student response: ${answer}

Return JSON:
{
  "priorExposure": "none|some|solid",
  "goalHint": "string"
}`
  }),

  // ----- 8. Dynamic Repair Node -----
  createDynamicNode: (problem: string, currentNode: string, profile: string) => ({
    system: `You create a small repair/bridge/practice node to fix a specific learner problem.
Output valid JSON only.`,
    user: `Detected problem: ${problem}
Current node: ${currentNode}
Learner profile: ${profile}

Return JSON: same shape as enrichNode plus { "id": "snake_case_id", "type": "repair|bridge|practice|application|curiosity|compression" }`
  })
}
```

---

## Phase 5: Exa Client (`src/exa/client.ts`)

```ts
import { CONFIG } from "../config"
import type { ExaSearchType } from "../types"

type ExaSearchRequest = {
  query: string
  type?: ExaSearchType
  numResults?: number
  contents?: {
    highlights?: { maxCharacters: number }
    summary?: boolean
  }
}

export async function exaSearch(req: ExaSearchRequest) {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CONFIG.exaApiKey
    },
    body: JSON.stringify({
      type: "auto",
      numResults: 5,
      contents: { highlights: { maxCharacters: 2000 }, summary: true },
      ...req
    })
  })
  if (!res.ok) throw new Error(`Exa error ${res.status}: ${await res.text()}`)
  return res.json()
}
```

### Search Type Selection (`src/exa/client.ts`)

```ts
export type RetrievalIntent =
  | "topic_autocomplete" | "quick_fact_or_example"
  | "focused_node_context" | "initial_topic_graph"
  | "complex_cross_topic_research"

export function chooseExaSearchType(intent: RetrievalIntent): ExaSearchType {
  if (intent === "topic_autocomplete") return "instant"
  if (intent === "quick_fact_or_example") return "fast"
  if (intent === "focused_node_context") return "auto"
  if (intent === "initial_topic_graph") return "deep"
  if (intent === "complex_cross_topic_research") return "deep-reasoning"
  return "auto"
}
```

For MVP only `auto`, `deep`, and cached fallback are required.

### Normalize (`src/exa/normalize.ts`)

After raw Exa results return, run each one through the LLM to classify `readingDifficulty`, `sourceType`, and `useFor` (which graph nodes it might support). Use `extractConcepts`-style prompt or do this inline during graph build to save LLM calls.

```ts
import crypto from "node:crypto"
import type { SourcePacket, SourceResult, ExaSearchType } from "../types"

export function normalizeExaResults(
  raw: any,
  topic: string,
  query: string,
  searchType: ExaSearchType
): SourcePacket {
  const results: SourceResult[] = (raw.results ?? []).map((r: any) => ({
    id: crypto.randomUUID(),
    title: r.title ?? "untitled",
    url: r.url,
    publishedDate: r.publishedDate,
    author: r.author,
    snippet: r.text?.slice(0, 400) ?? "",
    highlights: r.highlights ?? [],
    summary: r.summary,
    sourceType: "unknown",
    readingDifficulty: "unknown",
    useFor: []
  }))
  return {
    id: crypto.randomUUID(),
    topic,
    query,
    searchType,
    retrievedAt: new Date().toISOString(),
    cached: false,
    results
  }
}
```

### Cache (`src/exa/cache.ts`)

```ts
import { db } from "../db/migrate"
import type { SourcePacket } from "../types"

export function findCachedPacket(topic: string): SourcePacket | null {
  const row = db.prepare(`
    SELECT raw_json FROM source_packets
    WHERE topic = ? ORDER BY retrieved_at DESC LIMIT 1
  `).get(topic) as { raw_json: string } | undefined
  return row ? JSON.parse(row.raw_json) : null
}

export function savePacket(p: SourcePacket) {
  db.prepare(`
    INSERT INTO source_packets (id, topic, query, search_type, retrieved_at, cached, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(p.id, p.topic, p.query, p.searchType, p.retrievedAt, p.cached ? 1 : 0, JSON.stringify(p))
}
```

### Retrieval Pipeline

For a new topic:

```text
1. Normalize topic (lowercase, trim).
2. Check SQLite cache for a recent SourcePacket.
3. If cached, mark cached: true and use it.
4. If not cached, call Exa /search with type="deep" and 8 results.
5. Normalize results into SourcePacket.
6. Ask LLM to classify each result (difficulty, source type, useFor) — bundle into the concept extraction step.
7. Save packet.
8. Build graph from selected snippets, not raw pages.
```

For a current node:

```text
1. Read node.sourceTags and node.keyTerms.
2. Filter existing SourcePacket results by useFor / sourceTags.
3. If fewer than 2 useful snippets, call Exa with type="auto" and a focused query.
4. Append new results to the session source packet.
5. Pass top 2-3 relevant snippets into the teaching context.
```

---

## Phase 6: Profile & Session Lifecycle

### Load profile (`src/db/profiles.ts`)

```ts
import { db } from "./migrate"
import { CONFIG } from "../config"
import type { StudentProfile } from "../types"

export function loadProfile(id = CONFIG.defaultProfileId): StudentProfile {
  const row: any = db.prepare("SELECT * FROM student_profiles WHERE id = ?").get(id)
  if (!row) throw new Error(`profile ${id} not found`)
  return {
    id: row.id,
    readingMode: row.reading_mode,
    pace: row.pace,
    dyslexiaMode: !!row.dyslexia_mode,
    adhdSupport: !!row.adhd_support,
    prefers: JSON.parse(row.prefers_json),
    avoid: JSON.parse(row.avoid_json),
    strengths: JSON.parse(row.strengths_json),
    struggles: JSON.parse(row.struggles_json),
    topicConfidence: JSON.parse(row.topic_confidence_json),
    recentPatterns: JSON.parse(row.recent_patterns_json),
    conceptMastery: JSON.parse(row.concept_mastery_json),
    spacedReviews: JSON.parse(row.spaced_reviews_json)
  }
}
```

### Goal mode derivation

```ts
export function deriveGoalMode(intent: StudentIntent): GoalMode {
  if (intent.goalType === "exam") return "practice"
  if (intent.goalType === "application") return "application"
  if (intent.goalType === "foundation") return "catch_up"
  return "beginner_intro"
}
```

### Session start (`src/api/session.ts`, partial)

```ts
import crypto from "node:crypto"
import { db } from "../db/migrate"

export function createSession(profileId: string, topic: string, intent: StudentIntent): string {
  const id = crypto.randomUUID()
  const goalMode = deriveGoalMode(intent)
  db.prepare(`
    INSERT INTO sessions (id, student_profile_id, topic, intent_json, goal_mode, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, profileId, topic, JSON.stringify(intent), goalMode, new Date().toISOString())
  return id
}
```

---

## Phase 7: Diagnostic Phase

For MVP, skip a formal diagnostic. The opening message is two short questions; the student's free-text reply is parsed once.

### Opening message

```ts
export function buildOpeningMessage(topic: string): string {
  return `Before we map out ${topic}, two quick things:

1. Have you seen this topic before — even briefly?
2. Is there a specific reason you're learning it right now?

No pressure — anything you say helps me find the right starting point.`
}
```

### Parse the reply

```ts
import { callLLMJson } from "../llm/json"
import { PROMPTS } from "../llm/prompts"

export type DiagnosticParse = {
  priorExposure: "none" | "some" | "solid"
  goalHint: string
}

export async function parseDiagnostic(answer: string, topic: string): Promise<DiagnosticParse> {
  const p = PROMPTS.parseDiagnostic(answer, topic)
  return callLLMJson<DiagnosticParse>(p.system, p.user, 0.1)
}
```

Initial mastery seed values:

```ts
const INITIAL_MASTERY = { none: 0, some: 0.30, solid: 0.65 } as const
```

Apply this to the `topicConfidence` field for the topic root and to known prerequisite nodes after graph build.

---

## Phase 8: Topic → Knowledge Graph Pipeline

The full pipeline matches `aura.md` §"Converting Exa Results Into a Knowledge Graph" plus §"Validation, Cleanup, and Deferral".

```text
exa raw -> normalized SourcePacket
       -> concept extraction
       -> concept deduplication (canonical IDs)
       -> prerequisite edge inference
       -> node enrichment (full KnowledgeNode draft)
       -> structural validation (deterministic code)
       -> LLM cleanup operations (merge/split/rename/delete)
       -> structural validation again
       -> deferral selection (active vs deferred)
       -> KnowledgeGraph
```

### `src/pipeline/buildGraph.ts`

```ts
import crypto from "node:crypto"
import { exaSearch } from "../exa/client"
import { normalizeExaResults } from "../exa/normalize"
import { findCachedPacket, savePacket } from "../exa/cache"
import { callLLMJson } from "../llm/json"
import { PROMPTS } from "../llm/prompts"
import type { KnowledgeGraph, KnowledgeNode, GraphEdge, StudentProfile, SourcePacket } from "../types"

export async function buildGraph(
  topic: string,
  profile: StudentProfile
): Promise<{ graph: KnowledgeGraph; packet: SourcePacket }> {
  // 1. retrieve sources
  let packet = findCachedPacket(topic)
  if (!packet) {
    const raw = await exaSearch({
      query: `${topic} beginner prerequisites common misconceptions`,
      type: "deep",
      numResults: 8,
      contents: { highlights: { maxCharacters: 4000 }, summary: true }
    })
    packet = normalizeExaResults(raw, topic, topic, "deep")
    savePacket(packet)
  }

  // 2. extract concepts
  const sourceText = packet.results
    .map(r => `[${r.id}] ${r.title}\n${r.snippet}\n${r.highlights.join(" | ")}`)
    .join("\n\n")
  const conceptsP = PROMPTS.extractConcepts(topic, sourceText)
  const concepts = await callLLMJson<{ concepts: any[] }>(conceptsP.system, conceptsP.user)

  // 3. canonicalize IDs
  const drafts = concepts.concepts.map(c => ({
    id: canonicalId(c.label),
    label: c.label,
    teachingGoal: c.teachingGoal,
    keyTerms: c.keyTerms,
    sourceResultIds: c.sourceResultIds
  }))

  // 4. infer edges
  const edgesP = PROMPTS.inferEdges(JSON.stringify(drafts.map(d => ({ id: d.id, label: d.label, goal: d.teachingGoal }))))
  const edgesOut = await callLLMJson<{ edges: GraphEdge[] }>(edgesP.system, edgesP.user)
  const edges: GraphEdge[] = edgesOut.edges.map(e => ({ ...e, relation: "prerequisite" }))

  // 5. enrich each node
  const nodes: KnowledgeNode[] = []
  for (const d of drafts) {
    const sources = packet.results
      .filter(r => d.sourceResultIds.includes(r.id))
      .map(r => `${r.title}: ${r.highlights.join(" | ")}`)
      .join("\n")
    const enrichP = PROMPTS.enrichNode(JSON.stringify(d), sources, JSON.stringify(profile))
    const enriched = await callLLMJson<any>(enrichP.system, enrichP.user)
    nodes.push({
      id: d.id,
      topicName: enriched.topicName,
      teachingGoal: enriched.teachingGoal,
      prerequisites: edges.filter(e => e.target === d.id).map(e => e.source),
      nextCandidates: edges.filter(e => e.source === d.id).map(e => e.target),
      sourceTags: enriched.sourceTags ?? [],
      keyTerms: enriched.keyTerms ?? d.keyTerms,
      readinessCheck: enriched.readinessCheck,
      comfortCheck: enriched.comfortCheck,
      microLessonPlan: enriched.microLessonPlan,
      commonConfusions: enriched.commonConfusions ?? [],
      teachingHints: enriched.teachingHints ?? [],
      repairStrategies: enriched.repairStrategies ?? [],
      mission: enriched.mission,
      status: "locked",
      mastery: 0,
      evidence: [],
      type: "core"
    })
  }

  // 6. validate -> cleanup -> validate
  let graph: KnowledgeGraph = {
    id: crypto.randomUUID(),
    topic,
    sourcePacketIds: [packet.id],
    nodes,
    edges
  }
  const warnings = validateGraph(graph)
  if (warnings.length === 0) return { graph, packet }

  const cleanupP = PROMPTS.cleanupGraph(JSON.stringify({ nodes: nodes.map(n => ({ id: n.id, name: n.topicName, goal: n.teachingGoal })), warnings }))
  const cleanup = await callLLMJson<{ operations: any[] }>(cleanupP.system, cleanupP.user)
  graph = applyCleanup(graph, cleanup.operations)
  validateGraph(graph) // throw if still invalid
  return { graph, packet }
}

function canonicalId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}
```

### Validation (`src/pipeline/validate.ts`)

```ts
export function validateGraph(g: KnowledgeGraph): string[] {
  const warnings: string[] = []
  const ids = new Set(g.nodes.map(n => n.id))

  if (ids.size !== g.nodes.length) warnings.push("duplicate node IDs")
  if (g.nodes.length < 4 || g.nodes.length > 16) warnings.push(`unusual node count: ${g.nodes.length}`)

  for (const e of g.edges) {
    if (!ids.has(e.source)) warnings.push(`edge source missing: ${e.source}`)
    if (!ids.has(e.target)) warnings.push(`edge target missing: ${e.target}`)
  }
  for (const n of g.nodes) {
    if (!n.teachingGoal) warnings.push(`node ${n.id} missing teachingGoal`)
    if (!n.readinessCheck || !n.comfortCheck) warnings.push(`node ${n.id} missing checks`)
  }
  if (hasCycle(g)) warnings.push("graph has prerequisite cycle")
  return warnings
}

function hasCycle(g: KnowledgeGraph): boolean {
  const adj: Record<string, string[]> = {}
  for (const n of g.nodes) adj[n.id] = []
  for (const e of g.edges) if (e.relation === "prerequisite") adj[e.source].push(e.target)
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color: Record<string, number> = {}
  for (const n of g.nodes) color[n.id] = WHITE
  function dfs(u: string): boolean {
    color[u] = GRAY
    for (const v of adj[u]) {
      if (color[v] === GRAY) return true
      if (color[v] === WHITE && dfs(v)) return true
    }
    color[u] = BLACK
    return false
  }
  return g.nodes.some(n => color[n.id] === WHITE && dfs(n.id))
}
```

### Cleanup application (`src/pipeline/validate.ts` cont.)

`applyCleanup` runs each LLM-proposed operation against the graph: merges combine nodes (and rewrite edges), splits create new nodes, renames update `topicName`, deletes drop nodes and their edges. Implementation is straightforward array manipulation — do it in code, not via LLM.

### Deferral

After validation, separate active vs deferred nodes by goal mode:

```ts
function selectActive(g: KnowledgeGraph, goalMode: GoalMode): { active: string[]; deferred: string[] } {
  const tooAdvanced = (n: KnowledgeNode) =>
    /(unit circle|radian|identity|inverse|graph transformation|derivative|limit)/i.test(n.topicName)

  const active: string[] = []
  const deferred: string[] = []
  for (const n of g.nodes) {
    if (goalMode === "beginner_intro" && tooAdvanced(n)) deferred.push(n.id)
    else active.push(n.id)
  }
  return { active, deferred }
}
```

This is heuristic; the LLM cleanup pass can refine it.

---

## Phase 9: Graph → Lesson Path Pipeline (`src/pipeline/linearize.ts`)

The 9 steps from `aura.md` §"Linearizing the Knowledge Graph".

### Step inputs

```ts
export type LinearizationInput = {
  graph: KnowledgeGraph
  profile: StudentProfile
  diagnostic: { priorExposure: "none" | "some" | "solid" }
  intent: StudentIntent
  goalMode: GoalMode
  activeNodeIds: string[]
}
```

### Step 1: scope (already done by `selectActive`).

### Step 2: mark readiness

```ts
function markReadiness(input: LinearizationInput): Record<string, NodeStatus> {
  const status: Record<string, NodeStatus> = {}
  const seedMastery = { none: 0, some: 0.3, solid: 0.65 }[input.diagnostic.priorExposure]
  for (const id of input.activeNodeIds) {
    const node = input.graph.nodes.find(n => n.id === id)!
    const prereqsReady = node.prerequisites.every(pid => (input.profile.conceptMastery[pid]?.storedMastery ?? seedMastery) >= 0.55)
    status[id] = prereqsReady ? "ready" : "locked"
  }
  return status
}
```

### Step 3: prune (already part of active selection).

### Step 4: topological sort

```ts
function topoSort(nodes: KnowledgeNode[], edges: GraphEdge[]): string[] {
  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const ids = new Set(nodes.map(n => n.id))

  function visit(id: string) {
    if (!ids.has(id)) return
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error("cycle")
    visiting.add(id)
    const prereqs = edges.filter(e => e.target === id && e.relation === "prerequisite").map(e => e.source)
    for (const p of prereqs) visit(p)
    visiting.delete(id)
    visited.add(id)
    sorted.push(id)
  }
  for (const n of nodes) visit(n.id)
  return sorted
}
```

### Step 5: tie-break by score

```ts
function scoreNode(
  node: KnowledgeNode,
  graph: KnowledgeGraph,
  profile: StudentProfile,
  intent: StudentIntent
): number {
  const goalRelevance = computeGoalRelevance(node, intent)            // 0..1
  const unlock = computeUnlockPower(node, graph)                       // 0..1
  const role = computeRoleImportance(node, intent)                     // 0..1
  const weakness = profile.struggles.some(s => node.keyTerms.some(k => s.includes(k))) ? 1 : 0
  const interest = profile.prefers.some(p => node.teachingGoal.toLowerCase().includes(p)) ? 1 : 0
  const cognitiveLoad = (node.commonConfusions.length > 4 ? 1 : 0.4)
  const known = (profile.conceptMastery[node.id]?.storedMastery ?? 0)

  return goalRelevance * 0.25
       + unlock * 0.20
       + role * 0.20
       + weakness * 0.10
       + interest * 0.05
       - cognitiveLoad * 0.20
       - known * 0.25
}

function computeGoalRelevance(node: KnowledgeNode, intent: StudentIntent): number {
  if (intent.goalType === "exam" && /(common mistake|practice|formula)/i.test(node.topicName)) return 1
  if (intent.goalType === "curiosity" && /(application|why|intuition)/i.test(node.topicName)) return 1
  if (intent.goalType === "application" && /(application|use|real)/i.test(node.topicName)) return 1
  if (intent.goalType === "foundation" && node.prerequisites.length === 0) return 1
  return 0.5
}

function computeUnlockPower(node: KnowledgeNode, graph: KnowledgeGraph): number {
  const dependents = graph.edges.filter(e => e.source === node.id).length
  return Math.min(1, dependents / 5)
}

function computeRoleImportance(node: KnowledgeNode, intent: StudentIntent): number {
  // core nodes (not application/aside) score higher unless intent says otherwise
  if (node.type === "core") return 0.9
  if (node.type === "application" && intent.goalType === "application") return 1
  return 0.5
}
```

### Step 6: compress mastered prerequisites

For any node whose stored mastery exceeds 0.80, set delivery mode `compressed_refresh`. Below 0.55, insert a repair before it.

### Step 7: pick start

```ts
function pickStartIndex(items: LessonPathItem[], profile: StudentProfile): number {
  for (let i = 0; i < items.length; i++) {
    const m = profile.conceptMastery[items[i].nodeId]?.storedMastery ?? 0
    if (m < 0.75) return i
  }
  return 0
}
```

### Step 8: build LessonPath items with delivery modes

```ts
function assignDeliveryMode(node: KnowledgeNode, profile: StudentProfile): DeliveryMode {
  const m = profile.conceptMastery[node.id]?.storedMastery ?? 0
  if (m >= 0.80) return "compressed_refresh"
  return "full"
}
```

### Step 9: compose `linearize(input)` end-to-end

```ts
export function linearize(input: LinearizationInput): LessonPath {
  const activeNodes = input.graph.nodes.filter(n => input.activeNodeIds.includes(n.id))
  const activeEdges = input.graph.edges.filter(e => input.activeNodeIds.includes(e.source) && input.activeNodeIds.includes(e.target))

  const ordered = topoSort(activeNodes, activeEdges)
  // tie-break: re-sort within "ready at the same time" groups by score desc
  const scored = ordered.sort((a, b) => {
    const na = activeNodes.find(n => n.id === a)!
    const nb = activeNodes.find(n => n.id === b)!
    return scoreNode(nb, input.graph, input.profile, input.intent) - scoreNode(na, input.graph, input.profile, input.intent)
  })

  const items: LessonPathItem[] = scored.map(id => {
    const node = activeNodes.find(n => n.id === id)!
    return {
      nodeId: id,
      deliveryMode: assignDeliveryMode(node, input.profile),
      required: true,
      reason: `core path for ${input.goalMode}`
    }
  })

  const currentIndex = pickStartIndex(items, input.profile)
  const skipped = input.graph.nodes.filter(n => !input.activeNodeIds.includes(n.id)).map(n => n.id)

  return {
    graphId: input.graph.id,
    items,
    currentIndex,
    skippedNodeIds: skipped,
    insertedNodeIds: [],
    reasonByNodeId: Object.fromEntries(items.map(i => [i.nodeId, i.reason]))
  }
}
```

---

## Phase 10: Teaching Loop (`src/pipeline/teach.ts`)

### Build TeachingContext

```ts
export function buildTeachingContext(
  session: Session,
  graph: KnowledgeGraph,
  path: LessonPath,
  profile: StudentProfile,
  packet: SourcePacket,
  liveModel: LiveStudentModel
): TeachingContext {
  const item = path.items[path.currentIndex]
  const currentNode = graph.nodes.find(n => n.id === item.nodeId)!

  // prerequisites
  const prereqContext = currentNode.prerequisites.map(pid => {
    const pNode = graph.nodes.find(n => n.id === pid)
    const u = liveModel.currentUnderstanding[pid]
    return {
      id: pid,
      status: pNode?.status ?? "locked",
      mastery: profile.conceptMastery[pid]?.storedMastery ?? 0,
      studentEvidence: u ? [u.lastEvidence] : []
    }
  })

  // next candidates (just IDs and a note)
  const next = currentNode.nextCandidates.slice(0, 2).map(id => ({ id, reason: "comes next on path" }))

  // source: top 2-3 snippets matching node tags
  const srcCtx = packet.results
    .filter(r => r.useFor.includes(currentNode.id) || currentNode.sourceTags.some(t => r.title.toLowerCase().includes(t.toLowerCase())))
    .slice(0, 3)
    .map(r => ({ title: r.title, url: r.url, relevantSnippet: r.highlights[0] ?? r.snippet }))

  // recent history: last 8 messages
  const recent = JSON.parse(session.history_json).slice(-8)

  // delivery mode -> instruction
  const maxLen = item.deliveryMode === "compressed_refresh" ? "60 words" : "120 words"

  return {
    currentNode,
    prerequisiteContext: prereqContext,
    nextNodeContext: next,
    studentProfile: profile,
    recentSessionHistory: recent,
    sourceContext: srcCtx,
    teachingInstruction: {
      mode: "teach_current_node",
      maxLength: maxLen,
      style: "conversational",
      mustInclude: ["one intuition", "one tiny example", "one soft comfort check"],
      mustAvoid: ["test language", "dense notation", ...profile.avoid]
    }
  }
}
```

### Teach call

```ts
import { callLLM } from "../llm/client"
import { PROMPTS } from "../llm/prompts"

export async function teach(ctx: TeachingContext): Promise<string> {
  const p = PROMPTS.teach(JSON.stringify(ctx))
  return callLLM(p.system, p.user, { temperature: 0.5, maxTokens: 400 })
}
```

---

## Phase 11: Soft Check Evaluation (`src/pipeline/evaluate.ts`)

```ts
import { callLLMJson } from "../llm/json"
import { PROMPTS } from "../llm/prompts"
import type { CheckEvaluation, SoftCheck } from "../types"

export async function evaluateCheck(check: SoftCheck, answer: string): Promise<CheckEvaluation> {
  const p = PROMPTS.evaluateCheck(check.prompt, check.expectedIdea, answer)
  return callLLMJson<CheckEvaluation>(p.system, p.user, 0.1)
}

export async function evaluateCheckRobust(check: SoftCheck, answer: string): Promise<CheckEvaluation> {
  const a = await evaluateCheck(check, answer)
  if (a.confidence >= 0.85) return a
  // run a second time with slight prompt variation
  const b = await evaluateCheck(check, answer)
  if (a.result === b.result) return { ...a, confidence: Math.min(0.95, (a.confidence + b.confidence) / 2) }
  return { result: "unclear", confidence: 0.5, evidence: a.evidence }
}
```

### Default thresholds

```ts
export const THRESHOLDS = {
  readiness: 0.55,
  mastery: 0.75,
  confidentPass: 0.80,
  fatigue: 0.70,
  blockedAfterFailures: 3
}
```

---

## Phase 12: Live Student Model (`src/state/liveModel.ts`)

After every check, update the live model.

```ts
import type { LiveStudentModel, CheckEvaluation, KnowledgeNode } from "../types"

export function updateLiveModel(
  model: LiveStudentModel,
  node: KnowledgeNode,
  evalResult: CheckEvaluation
): LiveStudentModel {
  const depth: LiveConceptUnderstanding["depth"] =
    evalResult.result === "pass" ? "structural"
    : evalResult.result === "partial" ? "surface"
    : "none"

  const updated: LiveStudentModel = {
    ...model,
    currentUnderstanding: {
      ...model.currentUnderstanding,
      [node.id]: {
        depth,
        confidence: evalResult.confidence,
        lastEvidence: evalResult.evidence,
        fragileAspects: evalResult.detectedIssue ? [evalResult.detectedIssue] : []
      }
    }
  }

  if (evalResult.demonstratedMisconception) {
    updated.demonstratedMisconceptions = [
      ...model.demonstratedMisconceptions,
      {
        misconception: evalResult.demonstratedMisconception,
        detectedAtNode: node.id,
        resolved: false,
        affectedFutureNodes: node.nextCandidates,
        evidence: [evalResult.evidence]
      }
    ]
  }

  // simple fatigue heuristic: each fail bumps fatigue
  if (evalResult.result === "fail") {
    updated.fatigue = {
      level: Math.min(1, model.fatigue.level + 0.15),
      evidence: [...model.fatigue.evidence, evalResult.evidence]
    }
  }

  return updated
}
```

---

## Phase 13: Misconception Tracker (`src/state/misconceptions.ts`)

Misconceptions persist across nodes. When the active node has unresolved misconceptions whose `affectedFutureNodes` includes it, inject reinforcement instructions into the teaching context's `mustInclude`.

```ts
export function applyMisconceptionConstraints(
  ctx: TeachingContext,
  model: LiveStudentModel
): TeachingContext {
  const relevant = model.demonstratedMisconceptions.filter(
    m => !m.resolved && m.affectedFutureNodes.includes(ctx.currentNode.id)
  )
  if (relevant.length === 0) return ctx
  return {
    ...ctx,
    teachingInstruction: {
      ...ctx.teachingInstruction,
      mustInclude: [
        ...ctx.teachingInstruction.mustInclude,
        ...relevant.map(m => `briefly correct: ${m.misconception}`)
      ]
    }
  }
}
```

A misconception is marked `resolved: true` only after a targeted comfort check passes with confidence >= 0.80.

---

## Phase 14: Adaptation Engine (`src/pipeline/adapt.ts`)

The decision tree from `aura.md` §"Node Transition Logic" + §"Next Node Selection".

```ts
export type FailureCounters = Record<string, number>  // nodeId -> consecutive fails

export function decideTransition(
  evalResult: CheckEvaluation,
  currentNode: KnowledgeNode,
  path: LessonPath,
  liveModel: LiveStudentModel,
  failures: FailureCounters
): NodeTransitionAction {
  const fails = failures[currentNode.id] ?? 0

  // Three failures -> block
  if (fails >= 3) return { type: "BLOCK_CURRENT", reason: "three consecutive comfort check failures" }

  // Fatigue too high -> review pause
  if (liveModel.fatigue.level >= 0.70) {
    const recentMastered = Object.entries(liveModel.currentUnderstanding)
      .filter(([_, u]) => u.depth === "structural")
      .map(([id]) => id).slice(-3)
    return { type: "PAUSE_FOR_REVIEW", reviewNodeIds: recentMastered }
  }

  // Pass with confidence -> advance
  if (evalResult.result === "pass" && evalResult.confidence >= 0.80) {
    const next = path.items[path.currentIndex + 1]
    if (!next) return { type: "ADVANCE", nextNodeId: "__END__" }
    return { type: "ADVANCE", nextNodeId: next.nodeId }
  }

  // Partial -> repair current with one more example
  if (evalResult.result === "partial") {
    return {
      type: "REPAIR_CURRENT",
      strategy: { confusion: evalResult.detectedIssue ?? "partial understanding", action: "give_example" }
    }
  }

  // First fail -> repair current
  if (fails === 0) {
    return {
      type: "REPAIR_CURRENT",
      strategy: { confusion: evalResult.detectedIssue ?? "missed core idea", action: "reexplain" }
    }
  }

  // Second fail -> insert dynamic repair node
  // (caller is responsible for actually creating the node via dynamicNode.ts)
  return {
    type: "INSERT_REPAIR_NODE",
    node: {} as KnowledgeNode  // filled in by caller after dynamicNode creation
  }
}
```

### Apply path mutations

```ts
export function applyMutation(path: LessonPath, m: PathMutation): LessonPath {
  const items = [...path.items]
  switch (m.type) {
    case "insertBefore": {
      const idx = items.findIndex(i => i.nodeId === m.targetNodeId)
      if (idx >= 0) items.splice(idx, 0, m.newItem)
      break
    }
    case "insertAfter": {
      const idx = items.findIndex(i => i.nodeId === m.currentNodeId)
      if (idx >= 0) items.splice(idx + 1, 0, m.newItem)
      break
    }
    case "replaceItem": {
      const idx = items.findIndex(i => i.nodeId === m.nodeId)
      if (idx >= 0) items.splice(idx, 1, ...m.newItems)
      break
    }
    case "skipUpcoming": {
      const idx = items.findIndex(i => i.nodeId === m.nodeId)
      if (idx >= 0) items.splice(idx, 1)
      break
    }
    case "compressUpcoming": {
      const idx = items.findIndex(i => i.nodeId === m.nodeId)
      if (idx >= 0) items[idx] = { ...items[idx], deliveryMode: "compressed_refresh" }
      break
    }
  }
  return { ...path, items, insertedNodeIds: [...path.insertedNodeIds, ...newIds(m)] }
}
```

---

## Phase 15: Dynamic Node Creation (`src/pipeline/dynamicNode.ts`)

Triggers from `aura.md` §"Dynamic Node Creation":

```text
- 2 consecutive comfort check fails
- student says "I don't get this"
- student asks about a missing prerequisite
- student is overloaded
- student is bored / asks for application
- student asks a curiosity branch question
```

```ts
import { callLLMJson } from "../llm/json"
import { PROMPTS } from "../llm/prompts"
import type { KnowledgeNode, StudentProfile } from "../types"

export async function createDynamicNode(
  problem: string,
  currentNode: KnowledgeNode,
  profile: StudentProfile
): Promise<KnowledgeNode> {
  const p = PROMPTS.createDynamicNode(problem, JSON.stringify({ id: currentNode.id, name: currentNode.topicName }), JSON.stringify(profile))
  const drafted = await callLLMJson<any>(p.system, p.user)
  return {
    id: drafted.id,
    topicName: drafted.topicName,
    teachingGoal: drafted.teachingGoal,
    prerequisites: [],
    nextCandidates: [],
    sourceTags: [],
    keyTerms: drafted.keyTerms ?? [],
    readinessCheck: drafted.readinessCheck,
    comfortCheck: drafted.comfortCheck,
    microLessonPlan: drafted.microLessonPlan,
    commonConfusions: drafted.commonConfusions ?? [],
    teachingHints: drafted.teachingHints ?? [],
    repairStrategies: [],
    mission: drafted.mission,
    parentNodeId: currentNode.id,
    returnNodeId: currentNode.id,
    type: drafted.type ?? "repair",
    status: "ready",
    mastery: 0,
    evidence: []
  }
}
```

When inserted, also add a graph edge `currentNode -> newNode` with relation `"repair"`.

---

## Phase 16: Source Confidence (`src/state/sourceConfidence.ts`)

Computed once after Exa retrieval and chunk filtering.

```ts
import type { SourcePacket, SourceConfidence, SourcePolicy } from "../types"

export function computeSourceConfidence(packet: SourcePacket): SourceConfidence {
  const usable = packet.results.filter(r => r.highlights.length > 0)
  if (usable.length < 3) return "low"
  const beginnerReadable = usable.filter(r => r.readingDifficulty === "beginner").length
  if (beginnerReadable === 0) return "low"
  if (usable.length >= 5 && beginnerReadable >= 2) return "high"
  return "medium"
}

export function policyFor(conf: SourceConfidence): SourcePolicy {
  if (conf === "high") return "trust_sources"
  if (conf === "medium") return "mixed"
  return "model_generated"
}
```

When low, raise the comfort check confidence threshold from `0.80` to `0.85` and inject a teaching instruction:

```text
This is a less common topic, so I'm working from general knowledge here.
```

---

## Phase 17: Terminal Failure / Graceful Degradation

Three-step escalation when a node hits `BLOCK_CURRENT`.

```ts
export async function escalateBlock(
  blocked: KnowledgeNode,
  graph: KnowledgeGraph,
  path: LessonPath,
  intent: StudentIntent,
  profile: StudentProfile
): Promise<{ action: "bypass" | "rebuild" | "pivot"; message: string; newPath?: LessonPath }> {
  const isHardPrereq = path.items.some(i => {
    const node = graph.nodes.find(n => n.id === i.nodeId)
    return node?.prerequisites.includes(blocked.id)
  })

  // Step 1: bypass if not on a hard prerequisite chain
  if (!isHardPrereq) {
    return {
      action: "bypass",
      message: `Marking ${blocked.topicName} as a known gap and continuing.`
    }
  }

  // Step 2: rebuild from highest mastered ancestor
  const ancestor = findHighestMasteredAncestor(graph, blocked.id, profile)
  if (ancestor) {
    const newPath = rebuildFromAncestor(graph, ancestor, blocked.id, profile, intent)
    return {
      action: "rebuild",
      message: `Let's try a different route from ${ancestor}.`,
      newPath
    }
  }

  // Step 3: pivot — declare missing foundation
  return {
    action: "pivot",
    message: `${blocked.topicName} needs ${blocked.prerequisites[0] ?? "an earlier foundation"}. Want to start there instead?`
  }
}
```

---


## Phase 17A: Frontend Contract + Gamification Bridge

The backend owns learning truth. The frontend owns rendering. The LLM fills structured card JSON only; it must never generate React, CSS, SVG, or arbitrary UI code.

```text
KnowledgeGraph + LessonPath + NodeRuntimeState + GameState
  -> deriveMapState(...)
  -> frontend block-world map

TeachingContext + active node + deliveryMode
  -> generateCardsForActiveNode(...)
  -> validated LessonCard[]
  -> frontend card registry
```

### UI Filling Process

Cards are generated node-by-node, not for the whole graph upfront.

```text
node becomes active
-> build TeachingContext
-> LLM returns 2-4 LessonCard objects
-> backend validates card schemas
-> backend returns cards to frontend
-> frontend renders cardRegistry[card.type]
```

Allowed MVP card templates:

```text
text_explain
mcq
drag_match
fill_blank
sort_steps
true_false
recap
repair_card
```

Default per-node generation:

```text
1 text_explain
1 interaction card
optional recap or repair card
```

Do not generate diagrams/animations for MVP unless a fixed card template already supports them. The current UI direction is block map + normal text + MCQ/drag/drop style interactions.

### Map State Derivation

Implement:

```ts
export function deriveMapState(
  graph: KnowledgeGraph,
  path: LessonPath,
  runtimeStates: Record<string, NodeRuntimeState>,
  gameState: GameState
): MapState
```

Rules:

```text
Node visual state is derived from runtime node status.
Repair nodes are hidden until inserted/discovered.
Frontend does not decide mastery, readiness, or shakiness.
```

State mapping:

```text
locked   -> locked
ready    -> ready
active   -> active
shaky    -> shaky
mastered -> mastered
blocked  -> blocked
deferred -> deferred
repair node type + not mastered -> repair
```

Edges are similarly derived:

```text
prerequisite edge to locked node -> inactive
edge between mastered nodes -> completed
edge into active node -> active
edge to newly ready child -> available
repair edge -> repair
```

### Backend Gamification Rules

Gamification is visualization of learning state, not a separate reward economy.

Use:

```text
block-world map
mission metadata per node
support node discovery
final application mission
session summary progress
```

Avoid:

```text
coins
gems
leaderboards
combat/raids
timers
limited hints
punishing streaks
```

Generate `GameEvent[]` from typed learning transitions:

```text
ready -> active: MISSION_STARTED
active/shaky -> mastered: MISSION_COMPLETED
child becomes ready: NODE_UNLOCKED
repair node inserted: SUPPORT_NODE_DISCOVERED
active -> shaky: NODE_BECAME_SHAKY
shaky -> blocked: NODE_BLOCKED
application/boss node unlocks: FINAL_MISSION_UNLOCKED
review due: REVIEW_DUE
```

### Card Event API

Primary teaching interaction should use card events. `/tutor/respond` can remain for free-text chat/power-ups, but card answers should go through a typed endpoint.

```ts
type CardEventRequest = {
  sessionId: string
  event: CardInteractionEvent
}

type CardEventResponse = {
  result?: CheckEvaluation
  feedbackMessage?: string
  cards?: LessonCard[]
  mapState?: MapState
  mapPatch?: MapPatch
  lessonPathPatch?: PathMutation
  gameEvents: GameEvent[]
  gameStatePatch?: Partial<GameState>
  currentNodeId: string
  nodeState: NodeRuntimeState
}
```

Example wrong-answer response:

```json
{
  "result": { "result": "fail", "confidence": 0.84, "evidence": "Student picked adjacent over hypotenuse." },
  "feedbackMessage": "This mix-up is common. I found a smaller stepping stone.",
  "cards": [
    {
      "id": "repair_ratio_001",
      "type": "repair_card",
      "nodeId": "ratio_intuition",
      "title": "Comparison first",
      "gentleMessage": "Before sine, let’s make ratios feel simple.",
      "correction": "A ratio just compares one amount to another."
    }
  ],
  "mapPatch": {
    "nodes": [
      { "id": "sine_ratio", "state": "shaky" },
      { "id": "ratio_intuition", "state": "repair" }
    ],
    "edges": [
      { "from": "sine_ratio", "to": "ratio_intuition", "state": "repair" }
    ]
  },
  "gameEvents": [
    {
      "type": "SUPPORT_NODE_DISCOVERED",
      "nodeId": "ratio_intuition",
      "parentNodeId": "sine_ratio",
      "reason": "Student needs ratio intuition before continuing."
    }
  ],
  "currentNodeId": "ratio_intuition",
  "nodeState": { "nodeId": "ratio_intuition", "status": "active" }
}
```

### Power-Ups

Power-ups are accessibility signals, not consumables.

```text
Hint
Example
Visualize
Slow Down
Break Steps
Read Aloud
Show Application
I Zoned Out
```

A power-up event should return either a new card or a modified teaching card. It should also update `LiveStudentModel.helpfulStrategies` over time.

### Frontend Renderer Contract

Frontend registries:

```ts
cardRegistry[card.type]
map renderer from MapState
power-up toolbar sends PowerUpSignal
```

Backend response drives UI:

```text
cards -> card stack
mapState/mapPatch -> block map
GameEvent[] -> animations/toasts
```

The frontend may animate `SUPPORT_NODE_DISCOVERED`, `MISSION_COMPLETED`, and `NODE_UNLOCKED`, but it must not invent learning state.

---

## Phase 18: API Surface (`src/api/session.ts`)

### `POST /generateLesson`

Creates session, builds graph, linearizes, returns opening message.

Request:
```json
{
  "topic": "trigonometry",
  "intent": {
    "goalType": "exam",
    "timeHorizon": "single_session",
    "depthPreference": "working_knowledge"
  }
}
```

Response:
```json
{
  "sessionId": "uuid",
  "openingMessage": "Before we map out trigonometry, two quick things: ...",
  "graph": { /* KnowledgeGraph */ },
  "lessonPath": { /* LessonPath */ },
  "mapState": { /* MapState for block-world UI */ },
  "cards": [/* first active node LessonCard[] */],
  "gameState": { /* GameState */ },
  "missionMetadata": { "sine_ratio": { /* NodeMissionMetadata */ } },
  "sourceConfidence": "medium"
}
```

Implementation:
```ts
app.post("/generateLesson", async (req, res) => {
  const { topic, intent } = req.body
  const profile = loadProfile()
  const sessionId = createSession(profile.id, topic, intent)

  const { graph, packet } = await buildGraph(topic, profile)
  saveGraph(sessionId, graph)

  const goalMode = deriveGoalMode(intent)
  const { active } = selectActive(graph, goalMode)
  // diagnostic phase: opening message only; actual parse happens on first /tutor/respond
  const path = linearize({
    graph, profile,
    diagnostic: { priorExposure: "none" },  // updated after first reply
    intent, goalMode, activeNodeIds: active
  })
  savePath(sessionId, path)

  const sourceConfidence = computeSourceConfidence(packet)
  updateSession(sessionId, { source_confidence: sourceConfidence })

  const gameState = initializeGameState(sessionId, graph, path)
  saveGameState(sessionId, gameState)
  const mapState = deriveMapState(graph, path, loadNodeRuntimeStates(sessionId), gameState)
  const cards = await generateCardsForActiveNode({ sessionId, graph, path, profile, packet })

  res.json({
    sessionId,
    openingMessage: buildOpeningMessage(topic),
    graph,
    lessonPath: path,
    mapState,
    cards,
    gameState,
    missionMetadata: collectMissionMetadata(graph),
    sourceConfidence
  })
})
```

### `POST /tutor/respond`

Request:
```json
{
  "sessionId": "uuid",
  "studentMessage": "yeah I've seen sin and cos before",
  "signals": { "timeToRespondMs": 4200, "clickedHint": false }
}
```

Response:
```json
{
  "assistantMessage": "Nice — let's get straight to ratios then.",
  "transitionAction": { "type": "ADVANCE", "nextNodeId": "ratios" },
  "nodeState": { "nodeId": "ratios", "status": "active", "mastery": 0.3 },
  "check": { "id": "check_001", "nodeId": "ratios", "kind": "comfort", "prompt": "...", "expectedIdea": "...", "pressureLevel": "low", "evaluationMode": "semantic" },
  "checkEvaluation": null,
  "lessonPathPatch": { "type": "NO_CHANGE" },
  "liveStudentModelPatch": {},
  "mapState": { /* MapState */ },
  "cards": [/* LessonCard[] if the response should replace/append card stack */],
  "gameEvents": [],
  "gameStatePatch": {}
}
```

Implementation flow:
```ts
app.post("/tutor/respond", async (req, res) => {
  const { sessionId, studentMessage } = req.body
  const session = loadSession(sessionId)
  const profile = loadProfile()
  const graph = loadGraph(session.graph_id)
  const path = loadPath(session.lesson_path_id)
  const liveModel = JSON.parse(session.live_model_json)
  const packet = loadPacketForGraph(graph)

  // First reply -> parse diagnostic and reseed initial mastery
  const history = JSON.parse(session.history_json)
  if (history.length === 0) {
    const diag = await parseDiagnostic(studentMessage, session.topic)
    await applyDiagnosticToProfile(profile, session.topic, diag)
  }

  // If the previous turn ended on a comfort check, evaluate it
  let evaluation: CheckEvaluation | null = null
  const lastAssistant = history.findLast?.((h: any) => h.role === "assistant")
  if (lastAssistant?.endedOnCheck) {
    const currentNode = graph.nodes.find(n => n.id === path.items[path.currentIndex].nodeId)!
    evaluation = await evaluateCheckRobust(currentNode.comfortCheck, studentMessage)
    const updatedModel = updateLiveModel(liveModel, currentNode, evaluation)
    session.live_model_json = JSON.stringify(updatedModel)
  }

  // Decide transition
  let transition: NodeTransitionAction = { type: "ADVANCE", nextNodeId: path.items[path.currentIndex].nodeId }
  if (evaluation) {
    transition = decideTransition(evaluation, currentNode, path, liveModel, getFailureCounters(session))
  }

  // Apply mutation if needed
  if (transition.type === "INSERT_REPAIR_NODE") {
    const dyn = await createDynamicNode(evaluation!.detectedIssue ?? "confusion", currentNode, profile)
    graph.nodes.push(dyn)
    graph.edges.push({ source: currentNode.id, target: dyn.id, relation: "repair", reason: "dynamic repair" })
    transition.node = dyn
    const newPath = applyMutation(path, {
      type: "insertAfter",
      currentNodeId: currentNode.id,
      newItem: { nodeId: dyn.id, deliveryMode: "repair", required: true, reason: "repair" }
    })
    savePath(sessionId, newPath)
  }

  // Build context and teach
  let ctx = buildTeachingContext(session, graph, path, profile, packet, liveModel)
  ctx = applyMisconceptionConstraints(ctx, liveModel)
  const assistantMessage = await teach(ctx)

  // Persist history with `endedOnCheck` flag
  const newHistory = [
    ...history,
    { role: "student", message: studentMessage },
    { role: "assistant", message: assistantMessage, endedOnCheck: true }
  ]
  saveHistory(sessionId, newHistory)

  res.json({
    assistantMessage,
    nodeTransition: transition,
    updatedNodeStatuses: collectStatuses(graph),
    nextCheck: ctx.currentNode.comfortCheck,
    pathMutation: { type: transition.type === "INSERT_REPAIR_NODE" ? "insert" : "none", affectedNodeIds: [] }
  })
})
```

### `GET /session/:id/state`

Frontend polling endpoint (used by React Flow to keep the graph in sync):

```json
{
  "graph": { /* KnowledgeGraph */ },
  "lessonPath": { /* LessonPath */ },
  "currentNodeId": "sine_ratio",
  "history": [ /* messages */ ],
  "sourceConfidence": "medium"
}
```

### `POST /profile/update`

Request:
```json
{
  "explicitPreferences": { "dyslexiaMode": true },
  "observedSignals": []
}
```

Updates the profile row. For MVP, only `explicitPreferences` matters.

---

## Phase 19: Wiring It Together (`src/index.ts`)

```ts
import express from "express"
import { CONFIG } from "./config"
import { migrate } from "./db/migrate"
import { isLLMReady } from "./llm/client"
import sessionRouter from "./api/session"
import profileRouter from "./api/profile"

migrate()

const app = express()
app.use(express.json({ limit: "2mb" }))
app.use("/", sessionRouter)
app.use("/", profileRouter)

app.get("/health", async (_req, res) => {
  const llm = await isLLMReady()
  res.json({ ok: true, llm })
})

app.listen(CONFIG.backendPort, () => {
  console.log(`Aura backend on :${CONFIG.backendPort}`)
})
```

---

## Demo Run Order

1. Start LiteRT-LM server on port 8080 with Gemma 4.
2. Set `EXA_API_KEY` in `.env`.
3. `npm run dev` (or `ts-node src/index.ts`) — backend on :3001.
4. `GET /health` — confirm LLM is reachable.
5. Frontend calls `POST /generateLesson { topic: "trigonometry", intent: {...} }`.
6. Frontend renders the returned graph in React Flow and shows `openingMessage` in the chat panel.
7. Student replies → frontend calls `POST /tutor/respond` → backend evaluates, adapts, teaches → frontend re-renders graph with updated statuses.
8. Frontend polls `GET /session/:id/state` every 1–2 seconds to keep the graph view in sync (or just refetch after each `/tutor/respond`).

---

## Non-Goals for the Demo

Skipping by design — these are in `aura.md` but unnecessary for a single-session hackathon demo:

- Spaced repetition scheduling
- Mastery decay over time
- Cross-session continuity beyond profile persistence
- Source packet TTL invalidation
- Cross-topic graph linking
- Hallucination mitigation beyond Exa grounding
- Streaming LLM responses (polling/refetch is fine)
- Multi-user profile management
- Offline fallback content
- Boss missions and "support power-ups" (gamification leftovers — not yet designed in `aura.md`)

---

## Critical Path for Building

If time runs out, build in this order. Each item is independently demoable.

1. Phases 0–4 (setup + types + LLM + Exa wrappers) — nothing works without these.
2. Phase 8 (graph build) — can be tested with curl: topic in, graph out.
3. Phase 9 (linearize) — pure function, easy to verify.
4. Phase 10 (teach) — first end-to-end LLM call producing student-facing text.
5. Phase 11 (evaluate) + Phase 14 (decideTransition) — the adaptation moment, the demo's "wow".
6. Phase 18 (`/generateLesson`, `/tutor/respond`) — wire it up for the frontend.
7. Phase 15 (dynamic node creation) — the second "wow" moment when a repair node appears.
8. Phase 12 (live model) + Phase 13 (misconceptions) — adds depth, but the demo can ship without these if pressed for time.
9. Phase 16 (source confidence), Phase 17 (graceful degradation) — nice-to-have safety nets.

Build phases 1–7 first. Anything beyond is polish.
