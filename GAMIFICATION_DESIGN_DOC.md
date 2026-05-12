# Aura Gamification Design Doc

## Purpose

Aura should use gamification to make learning progress visible, motivating, and emotionally safe. The game layer must reinforce conceptual mastery, not distract from it.

The core experience is:

> The learner lights up a personal knowledge map by mastering concepts, repairing shaky ideas, and unlocking application challenges.

This is not a points-first system. Aura already has a strong native game surface: the concept graph. The right design is to make the graph feel alive.

## Product Principles

1. Mastery is the reward.
   - Rewards should represent real learning state: mastered, shaky, repaired, unlocked, deferred.
   - Cosmetic rewards are secondary and should not hide weak understanding.

2. Wrong answers create paths, not punishment.
   - A failed or partial check should reveal a repair mission.
   - The tone should be: "this needs a bridge", not "you failed".

3. The map is the main game board.
   - The knowledge graph should be the learner's progress surface.
   - Nodes, edges, unlocks, repairs, and boss/application nodes should carry the gamified experience.

4. Avoid pressure mechanics by default.
   - No leaderboard in the MVP.
   - No timed challenges in the MVP.
   - No streak guilt.
   - These are especially risky for ADHD, dyslexia, and anxious learners.

5. Gamification must be explainable.
   - Every reward should answer: "What did I understand better?"
   - Every unlock should answer: "Why is this available now?"

## Current System Fit

Aura already has several gamification primitives:

- `GameState` in `backend/src/types.ts`
- `GameEvent` event types:
  - `MISSION_STARTED`
  - `MISSION_COMPLETED`
  - `NODE_UNLOCKED`
  - `SUPPORT_NODE_DISCOVERED`
  - `NODE_BECAME_SHAKY`
- `mission` metadata on `KnowledgeNode`
- `missionMetadata` returned by `/generateLesson`
- map node states:
  - `locked`
  - `ready`
  - `active`
  - `shaky`
  - `mastered`
  - `blocked`
  - `deferred`
  - `repair`
- visual map rendering in `frontend/src/components/map/AuraMap.tsx`
- mastery and path progress UI in `frontend/src/App.tsx`

The immediate opportunity is not to invent a new system. It is to expose and tighten the system that already exists.

## Core Loop

```text
Learner starts topic
-> Aura builds concept graph
-> active node becomes a mission
-> learner completes cards and checks
-> backend evaluates response
-> node becomes mastered or shaky
-> map updates
-> next node or repair node unlocks
-> learner continues with visible progress
```

## Game Objects

### Mission

A mission is the gamified wrapper around a knowledge node.

Fields:

- `nodeId`
- `missionTitle`
- `objective`
- `rewardText`
- `missionType`
- `difficultyTone`

Mission types:

- `core`: normal concept mastery
- `repair`: misconception repair or prerequisite bridge
- `application`: synthesis or boss challenge
- `review`: spaced review
- `curiosity`: optional enrichment

### Node State

Node state is the source of truth for visual progress.

- `locked`: unavailable because prerequisites are missing
- `ready`: available but not active
- `active`: current mission
- `shaky`: learner showed uncertainty or misconception
- `repair`: support mission is available
- `mastered`: learner has demonstrated enough understanding
- `blocked`: cannot proceed without repair
- `deferred`: intentionally skipped for current goal
- `hidden`: not shown yet

### Event

Events are short-lived feedback objects. They power toasts, event feeds, subtle animation triggers, and recent history.

Existing events should be preserved:

```ts
type GameEvent =
  | { type: "MISSION_STARTED"; nodeId: string; title: string }
  | { type: "MISSION_COMPLETED"; nodeId: string; rewardText: string }
  | { type: "NODE_UNLOCKED"; nodeId: string; reason: string }
  | { type: "SUPPORT_NODE_DISCOVERED"; nodeId: string; parentNodeId: string; reason: string }
  | { type: "NODE_BECAME_SHAKY"; nodeId: string; reason: string };
```

Recommended additions later:

```ts
type GameEvent =
  | { type: "BOSS_UNLOCKED"; nodeId: string; reason: string }
  | { type: "REPAIR_COMPLETED"; nodeId: string; rewardText: string }
  | { type: "REVIEW_SCHEDULED"; nodeId: string; dueAt: string; reason: string }
  | { type: "CONCEPT_STRENGTHENED"; nodeId: string; delta: number; reason: string };
```

## UX Design

### Main Layout

Aura's current three-column workspace works well:

- left rail: knowledge map and node list
- center: current card/lesson interaction
- right rail: companion, mission, mastery, actions

Gamification should mostly live in the left and right rails, leaving the center focused on learning.

### Mission Panel

Add a right-rail `MissionPanel`.

Content:

- mission title
- mission type
- objective
- current node state
- reward text
- optional "why this matters" from lesson path reason

Example:

```text
Mission
Core Concept

Understand why sine is a ratio, not a button.

Reward
The cosine bridge becomes available.
```

This should replace or expand the current `Node role` companion card.

### Recent Events Feed

Add a compact event feed below mastery.

Examples:

```text
Mission complete: Similar triangles
Unlocked: Trig ratios
Shaky: Angle notation
Repair discovered: Ratio meaning
```

Rules:

- show 3 to 5 recent events
- newest first
- no large celebratory modal for normal progress
- use stronger celebration only for boss/application completion

### Map Feedback

The map should visually communicate:

- active node pulses gently
- mastered node becomes stable and marked
- shaky node uses warning styling without looking punitive
- repair node appears as a support bridge
- boss/application node uses stronger visual weight
- completed edges become visibly connected

Important: visual updates should not rely on color alone. Shape, icon, motion, or labels should also indicate state.

### Boss/Application Nodes

Application nodes should feel like synthesis challenges.

Behavior:

- unlocked after required prerequisites
- visually distinct on map
- framed as "use what you built"
- completion creates a stronger summary moment

Avoid calling them "boss" in learner-facing copy unless the target audience likes game language. Internally, `boss` is fine as a visual type.

### Repair Missions

Repair is the most important part of Aura's gamification.

When a learner struggles:

1. current node becomes `shaky`
2. Aura explains the likely issue gently
3. a repair mission is shown or generated
4. completing repair returns learner to the original path

Good copy:

```text
This idea needs a bridge.
```

Bad copy:

```text
Incorrect. Try again.
```

## Backend Design

### Existing Flow

Current response flow in `backend/src/api/session.ts`:

1. Load session, graph, path, game state.
2. Evaluate student response with `evaluateCheck`.
3. Advance or mark shaky.
4. Generate cards for next/current node.
5. Save graph, path, game state.
6. Return map state, cards, and events.

This is the right place for core gamification state transitions.

### State Transition Rules

Pass or partial:

- current node status -> `mastered`
- current node mastery increases
- current node visual state -> `mastered`
- add `MISSION_COMPLETED`
- next path node -> `active`
- add `NODE_UNLOCKED`

Fail or unclear:

- current node status -> `shaky`
- current node mastery decreases slightly
- current node visual state -> `shaky`
- add `NODE_BECAME_SHAKY`
- if repair strategy exists, expose or insert repair node

### Recommended Refactor

Move transition logic out of `session.ts` into a dedicated module:

```text
backend/src/pipeline/gameEngine.ts
```

Responsibilities:

- apply evaluation result to graph/path/game state
- emit game events
- decide unlocks
- decide repair discovery
- keep state transitions testable

Possible API:

```ts
export function applyCheckResult(input: {
  graph: KnowledgeGraph;
  path: LessonPath;
  gameState: GameState;
  evaluation: CheckEvaluation;
}): {
  graph: KnowledgeGraph;
  path: LessonPath;
  gameState: GameState;
  activeNodeId: string;
  events: GameEvent[];
};
```

## Frontend Design

### Components

Recommended new components:

```text
frontend/src/components/game/MissionPanel.tsx
frontend/src/components/game/RecentEvents.tsx
frontend/src/components/game/MasterySummary.tsx
```

### MissionPanel Props

```ts
type MissionPanelProps = {
  node?: KnowledgeNode;
  mapNode?: MapNode;
  metadata?: {
    missionTitle: string;
    objective: string;
    rewardText: string;
  };
  pathReason?: string;
};
```

### RecentEvents Props

```ts
type RecentEventsProps = {
  events: GameState["recentEvents"];
  nodes: KnowledgeNode[];
};
```

The component should resolve `nodeId` to readable node names.

### UI Placement

Right rail order:

1. Companion/status header
2. Mission panel
3. Quick help controls
4. Mastery summary
5. Recent events
6. Full map / new topic buttons

## Data Persistence

Session-level progress is currently stored in `session_game_states`.

For durable learner progress, update `StudentProfile` after meaningful events:

- completed concepts into `conceptMastery`
- weak concepts into `recentPatterns.confusionTriggers`
- useful repair strategies into `recentPatterns.helpfulStrategies`
- future reviews into `spacedReviews`

Suggested `conceptMastery` shape:

```ts
type ConceptMasteryRecord = {
  topic: string;
  nodeId: string;
  label: string;
  mastery: number;
  lastPracticedAt: string;
  evidence: string[];
  needsReview: boolean;
};
```

This should be added carefully because generated node IDs may not be stable across sessions. Prefer storing normalized concept labels and aliases alongside node IDs.

## Accessibility And Learner Safety

Gamification must respect Aura's learner support goals.

Requirements:

- no timed pressure by default
- no punishment language
- no losing progress on mistakes
- all map states must have non-color indicators
- animations should be subtle and pauseable/reduced under focus or reduced-motion settings
- copy should be short and concrete
- repair nodes should feel normal, not remedial

## Non-Goals For MVP

Do not build these first:

- global XP economy
- coins
- shop
- avatars
- daily streaks
- leaderboards
- competitive multiplayer
- randomized loot
- timed quizzes

These can make a demo look more game-like, but they do not strengthen Aura's learning loop yet.

## MVP Scope

### Phase 1: Surface Existing Game State

Goal: make the current game state visible.

Tasks:

1. Add `MissionPanel`.
2. Add `RecentEvents`.
3. Use `missionMetadata` in the right rail.
4. Improve toast messages from `recentEvents`.
5. Add event-specific styling.

Acceptance criteria:

- learner can see the current mission objective
- learner can see what unlocked and why
- learner can see when a node becomes shaky
- no backend schema change required

### Phase 2: Repair Missions

Goal: make struggle productive.

Tasks:

1. Extract game transition logic into `gameEngine.ts`.
2. Emit `SUPPORT_NODE_DISCOVERED` when evaluation fails and repair strategy exists.
3. Insert or reveal repair nodes in the path.
4. Return learner to original node after repair completion.

Acceptance criteria:

- failed checks create a visible support path
- repair completion changes state and emits a reward
- original lesson path remains understandable

### Phase 3: Durable Progress

Goal: connect session progress to learner memory.

Tasks:

1. Update `StudentProfile.conceptMastery`.
2. Add spaced review scheduling.
3. Show review missions on new sessions.
4. Use historical shaky concepts to influence graph planning.

Acceptance criteria:

- Aura remembers concepts beyond one session
- recurring weak concepts are treated earlier and gently
- review is framed as strengthening, not repetition

### Phase 4: Application Challenge Polish

Goal: make final application nodes feel satisfying.

Tasks:

1. Give application nodes distinct visual treatment.
2. Add an end-of-topic summary.
3. Show mastered concepts used in the final challenge.
4. Generate a learner-facing completion recap.

Acceptance criteria:

- completion feels meaningful
- learner understands what they can now do
- recap is grounded in actual mastered nodes

## Metrics

Track quality metrics, not vanity points.

Useful metrics:

- node completion rate
- repair completion rate
- number of shaky nodes recovered
- drop-off after shaky state
- average cards per mastered node
- review return success
- learner self-reported confidence before/after

Avoid optimizing for:

- time spent in app
- raw number of clicks
- streak length
- total generated cards

## Risks

1. Cosmetic gamification could hide weak pedagogy.
   - Mitigation: tie every reward to evaluated mastery or map state.

2. Too much animation could hurt focus.
   - Mitigation: keep animation subtle and respect focus/reduced-motion modes.

3. Generated concept IDs may not persist across sessions.
   - Mitigation: store normalized concept labels, aliases, and evidence, not only node IDs.

4. Repair paths could feel like failure.
   - Mitigation: use bridge/support language and make repair visually normal.

5. Backend transition logic could become scattered.
   - Mitigation: centralize in `gameEngine.ts`.

## Open Questions

1. Should learners be allowed to manually choose ready nodes, or should Aura keep a single guided path?
2. Should application challenges be required for all topics or only for application/exam goals?
3. How much learner-facing game language is appropriate for the target age group?
4. Should mastery thresholds vary by intent, such as exam versus curiosity?
5. Should repair nodes be generated ahead of time or only when needed?

## Recommendation

Build Phase 1 first. It is small, uses existing backend state, and will immediately make Aura feel more coherent.

Then build Phase 2. Repair missions are the highest-value gamification mechanic because they turn confusion into progress.

Do not prioritize XP, streaks, or coins until the map mission loop is working and tested.
