# Aura Frontend Guide

Implementation guide for the Aura hackathon frontend. The UI goal is to make Aura feel like a calm adaptive learning world: a block-based knowledge map, beautiful lesson cards, and visible repair paths when the learner struggles.

This guide assumes the backend contract in `backend_guide.md`.

## Core Frontend Rule

```text
Backend owns learning truth.
Frontend owns rendering.
LLM fills structured JSON only.
Frontend never renders AI-generated UI code.
```

The frontend receives:

```text
MapState
LessonCard[]
GameEvent[]
GameState
NodeMissionMetadata
```

and renders them through fixed component registries.

---

## Stack

```text
Electron
Vite
React
TypeScript
Tailwind CSS or plain CSS modules
Framer Motion optional
SVG for the map renderer
Zod for runtime schema validation
Lucide icons for controls
```

The existing `AURA_learning` prototype in Downloads is the visual reference for the map: block-world nodes, state colors, repair reveal, and a customization/tweaks panel.

---

## Frontend File Structure

```text
frontend/
  src/
    App.tsx
    main.tsx
    api/
      client.ts
      schemas.ts
    components/
      shell/
        AppShell.tsx
        TopBar.tsx
        PowerUpBar.tsx
      setup/
        TopicIntentScreen.tsx
        MapGenerationScreen.tsx
      map/
        AuraMap.tsx
        MapNode.tsx
        MapEdge.tsx
        mapState.ts
      cards/
        LessonCardRenderer.tsx
        cardRegistry.tsx
        TextExplainCard.tsx
        McqCard.tsx
        DragMatchCard.tsx
        FillBlankCard.tsx
        SortStepsCard.tsx
        TrueFalseCard.tsx
        RecapCard.tsx
        RepairCard.tsx
      game/
        gameEvents.ts
        GameToastLayer.tsx
      summary/
        SessionSummary.tsx
      tweaks/
        TweaksPanel.tsx
      styles/
        tokens.css
        app.css
```

---

## Main Screens

Aura MVP has four screens:

```text
1. Topic + intent setup
2. Map generation/loading
3. Learning cockpit
4. Session summary
```

Do not build a marketing landing page. The first screen should be the product.

---

## Screen 1: Topic + Intent Setup

Collect:

```ts
type StudentIntent = {
  goalType: "exam" | "curiosity" | "application" | "foundation"
  timeHorizon: "single_session" | "week" | "month"
  depthPreference: "intuition_only" | "working_knowledge" | "deep_mechanical"
}
```

Also collect learner mode:

```text
ADHD
Dyslexia
Both
```

Default recommendation: `Both`.

UI requirements:

```text
large topic input
segmented controls for intent
no dense explanation text
clear Start Map button
```

On submit:

```ts
POST /generateLesson
```

Then transition to the loading screen.

---

## Screen 2: Map Generation

Show a calm progress sequence:

```text
Building your learning map
Finding sources
Finding concepts
Tracing prerequisites
Choosing your first path
```

Use subtle block/node reveal animation. Avoid flashing or chaotic motion.

When `/generateLesson` returns:

```text
store sessionId
store mapState
store cards
store gameState
store missionMetadata
enter Learning Cockpit
```

---

## Screen 3: Learning Cockpit

Recommended layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ Top Bar: Aura | Topic | Goal | Source | Learner Mode        │
├───────────────────────────────────────┬─────────────────────┤
│                                       │ Current Mission     │
│        Block Knowledge Map            │ Lesson Card Stack   │
│                                       │                     │
├───────────────────────────────────────┴─────────────────────┤
│ Power-Ups: Hint Example Visualize Slow Down Steps Zoned Out  │
└─────────────────────────────────────────────────────────────┘
```

For the demo, the map should be visually dominant. The core product proof is map adaptation.

---

## Map Renderer

Use the `AURA_learning/map.jsx` direction:

```text
SVG map
block-world node theme
state-based colors/glows
curved edges
hidden repair nodes
repair edge reveal
node tooltip
```

Do not use React Flow for the first MVP if the custom SVG map already looks better.

### Map Types

```ts
type MapState = {
  nodes: MapNode[]
  edges: MapEdge[]
  activeNodeId: string
}

type MapNode = {
  id: string
  label: string
  x: number
  y: number
  type: "core" | "repair" | "application" | "boss"
  state:
    | "locked"
    | "ready"
    | "active"
    | "shaky"
    | "mastered"
    | "blocked"
    | "deferred"
    | "hidden"
    | "repair"
}

type MapEdge = {
  from: string
  to: string
  state:
    | "inactive"
    | "available"
    | "active"
    | "completed"
    | "repair"
    | "hidden"
}
```

### Node Visual States

```text
locked     dim block
ready      cyan glow
active     bright aura ring
shaky      amber pulse
mastered   gold/green lit block
blocked    gentle rose/orange
repair     smaller violet/blue stepping stone
deferred   faded distant block
hidden     not rendered
```

### Map Event Animations

Use backend `GameEvent[]`.

```text
SUPPORT_NODE_DISCOVERED:
show repair node
show repair edge
toast: New stepping stone discovered

NODE_BECAME_SHAKY:
turn node amber
short gentle pulse

MISSION_COMPLETED:
light node as mastered
show reward text

NODE_UNLOCKED:
turn child node ready
animate edge available

FINAL_MISSION_UNLOCKED:
reveal boss/application node
```

The frontend may animate events, but it must not invent learning state.

---

## Card Renderer

The main teaching UI is a card stack, not a plain chatbot.

The backend sends `LessonCard[]`. The frontend renders via registry:

```tsx
const cardRegistry = {
  text_explain: TextExplainCard,
  mcq: McqCard,
  drag_match: DragMatchCard,
  fill_blank: FillBlankCard,
  sort_steps: SortStepsCard,
  true_false: TrueFalseCard,
  recap: RecapCard,
  repair_card: RepairCard,
}
```

Renderer:

```tsx
function LessonCardRenderer({ card }: { card: LessonCard }) {
  const Component = cardRegistry[card.type]
  if (!Component) return <UnsupportedCard type={card.type} />
  return <Component card={card} />
}
```

Card design rules:

```text
one card = one idea or one interaction
large readable text
no tiny answer buttons
no red failure styling
gentle feedback
no scrolling required for MVP when possible
```

---

## Card Templates

### text_explain

```ts
type TextExplainCard = {
  id: string
  type: "text_explain"
  nodeId: string
  title: string
  body: string
  emphasis?: string[]
  spokenText?: string
}
```

Render as a calm teaching card with highlighted emphasis terms.

### mcq

```ts
type McqCard = {
  id: string
  type: "mcq"
  nodeId: string
  prompt: string
  options: { id: string; text: string; misconceptionId?: string }[]
  correctOptionId: string
  feedback: { correct: string; incorrectGeneric: string }
}
```

Render large option buttons. On submit, send `CardInteractionEvent` to backend. Do not permanently decide correctness in frontend beyond optimistic visual affordance.

### drag_match

```ts
type DragMatchCard = {
  id: string
  type: "drag_match"
  nodeId: string
  prompt: string
  items: { id: string; label: string }[]
  targets: { id: string; label: string }[]
  correctPairs: { itemId: string; targetId: string }[]
}
```

Implement simple drag/drop or click-to-match fallback. Accessibility fallback is important.

### fill_blank

```ts
type FillBlankCard = {
  id: string
  type: "fill_blank"
  nodeId: string
  prompt: string
  beforeBlank: string
  afterBlank: string
  acceptedAnswers: string[]
  hint?: string
}
```

Frontend can do light local validation for empty input, but semantic evaluation belongs to backend.

### sort_steps

```ts
type SortStepsCard = {
  id: string
  type: "sort_steps"
  nodeId: string
  prompt: string
  steps: { id: string; text: string }[]
  correctOrder: string[]
}
```

Use reorderable list or click-up/down controls.

### true_false

```ts
type TrueFalseCard = {
  id: string
  type: "true_false"
  nodeId: string
  statement: string
  correctAnswer: boolean
  misconceptionId?: string
}
```

Use two large buttons.

### recap

```ts
type RecapCard = {
  id: string
  type: "recap"
  nodeId: string
  title: string
  bullets: string[]
  nextUnlocked?: string[]
}
```

Use after a node is completed.

### repair_card

```ts
type RepairCard = {
  id: string
  type: "repair_card"
  nodeId: string
  misconceptionId: string
  title: string
  gentleMessage: string
  correction: string
  retryCardId?: string
}
```

Repair cards should feel supportive, not punitive.

---

## Interaction Events

Every interactive card sends a typed event.

```ts
type CardInteractionEvent = {
  sessionId: string
  cardId: string
  nodeId: string
  eventType: "answer_submitted" | "hint_requested" | "card_completed" | "power_up"
  payload: unknown
  telemetry: {
    responseTimeMs: number
    hintUsed: boolean
    attemptNumber: number
  }
}
```

Primary endpoint:

```text
POST /card-event
```

Response:

```ts
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

Frontend behavior:

```text
append/replace cards from response
apply mapState or mapPatch
animate GameEvent[]
show feedbackMessage gently
update current node display
```

---

## Power-Up Bar

Power-ups are accessibility controls, not consumables.

Buttons:

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

Signal type:

```ts
type PowerUpSignal =
  | { type: "REQUEST_HINT" }
  | { type: "REQUEST_EXAMPLE" }
  | { type: "REQUEST_VISUALIZE" }
  | { type: "REQUEST_SLOW_DOWN" }
  | { type: "REQUEST_BREAK_STEPS" }
  | { type: "REQUEST_READ_ALOUD" }
  | { type: "REQUEST_APPLICATION" }
  | { type: "ZONED_OUT" }
```

Send as a card event:

```json
{
  "eventType": "power_up",
  "payload": { "type": "REQUEST_EXAMPLE" }
}
```

Backend returns new/modified cards.

No limited-use counters.

---

## Customization / Tweaks

Keep the customizable UI idea from `AURA_learning/tweaks-panel.jsx`.

Expose user-friendly controls:

```text
theme: block_world / constellation / minimal
palette: midnight / forest / parchment
text density: compact / comfy / spacious
font: system / Atkinson / OpenDyslexic if available
motion: normal / reduced
```

For MVP, default to:

```text
theme: block_world
palette: midnight
text density: comfy
font: Atkinson/system
motion: reduced if OS asks for reduced motion
```

Customization should affect CSS variables, not component logic.

---

## Accessibility Rules

For ADHD:

```text
one idea per card
visible progress
frequent interaction
no clutter
no timer pressure
I Zoned Out button
```

For dyslexia:

```text
large text
short lines
generous line height
left aligned text
avoid italic/all-caps instructional text
symbol-to-word support where possible
read aloud support where possible
```

Motion:

```text
no flashing
no rapid blinking
no infinite busy animation except subtle map pulse
respect prefers-reduced-motion
```

Color:

```text
do not use color alone for correctness
combine color with icon/text/state
```

---

## Visual Style

Preferred direction:

```text
premium block-world learning map
calm dark canvas
soft glows
large cards
subtle depth
repair nodes as stepping stones
```

Avoid:

```text
childish classroom UI
busy Clash-of-Clans-style resource dashboards
leaderboard/coin/gem visuals
one-note purple gradients
red failure states
```

---

## Session Summary

End screen title:

```text
Your map grew today
```

Show:

```text
Unlocked
Mastered
Strengthened
New stepping stones
Next reviews
```

Example:

```text
Unlocked: Right Triangles, Side Names
Strengthened: Ratios
New stepping stone: Comparison Intuition
Next time: 30-second ratio warm-up, then Sine
```

Avoid language like:

```text
failed
penalty
rank
low score
```

---

## MVP Build Order

```text
1. Create app shell + topic/intent screen
2. Implement block-world AuraMap from MapState
3. Implement card registry + text_explain + mcq
4. Implement /generateLesson integration
5. Implement /card-event integration
6. Add repair_card and map repair-node reveal
7. Add drag_match
8. Add power-up bar
9. Add session summary
10. Add tweaks/customization panel
```

Most important demo moment:

```text
wrong answer
-> node becomes shaky
-> repair block appears
-> repair card opens
-> learner succeeds
-> repair block lights up
-> original path reconnects
```

That interaction should feel beautiful and obvious.
