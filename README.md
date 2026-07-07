# Aura

Aura is a local-first desktop tutor that runs entirely on-device. A local Gemma
model (served through LiteRT-LM) plans a concept curriculum, generates adaptive
lesson cards, evaluates answers, and schedules spaced review — with local Kokoro
text-to-speech for audio. In the steady state it makes **zero outbound network
calls**: all inference, all data, and all audio run locally.

It's built for learners who benefit from adaptation — chunked text, bionic
reading, hear-it TTS, and ADHD/dyslexia support modes — and adjusts difficulty
in real time from rolling answer accuracy.

## Tech Stack

- **Frontend:** React 19, Vite, Electron 35, Zustand, Motion
- **Backend:** Express, TypeScript, SQLite (`better-sqlite3`)
- **AI runtime:** Gemma (`gemma-4-E2B-it`) served locally with LiteRT-LM (Gemini-compatible API, GPU backend, optional speculative decoding / MTP)
- **Audio:** Kokoro ONNX TTS with macOS `say` fallback; optional Whisper STT
- **Testing:** Vitest + fast-check, CI on GitHub Actions
- **Package manager:** pnpm

---

## Architecture

Local, fully on-device tutor: Gemma (LiteRT-LM) plus a thin Express orchestrator
and a React/Electron front-end. A single broker multiplexes every agent's calls
through one local model.

### Generation pipeline

```
INPUT
  user types topic + intent  (image upload path also supported)
     │
     ▼
AGENT 1 — Curriculum Planner          backend/src/pipeline/buildGraph.ts
  one Gemma call → 7-9 ordered concepts
  (id, name, teachingGoal, prerequisites, keyTerms, commonConfusions)
  Persisted as "graph" + "lessonPath" in sqlite.
     │
     ▼
AGENT 2 — Lecture Planner             backend/src/pipeline/cardGenerator.ts ▶ planLecture
  per node: one Gemma call → 5-8 card plan
  picks card types from menu:
    text_explain | mcq | fill_blank | true_false | recap |
    analogy | story | vocab | visual | connection | flash | dragsort
     │
     ▼
AGENT 3 — Card Generator              cardGenerator.ts ▶ singleCardPrompt
  per planned card: one Gemma call → full card JSON
  AURA_VOICE_SPEC + AURA_BANNED_PHRASES enforced in prompt
  normalizeCards validates shape per type
     │
     ▼
AGENT 4 — Editor / Polisher           cardGenerator.ts ▶ polishLecture
  triggered only when local validators flag issues
  one Gemma call → rewritten card sequence (dedup, voice, length)
     │
     ▼
RENDER (frontend/src/screens/LessonScreen.tsx + cards/CardRegistry.tsx)
  cards[] → AnimatePresence motion stack → AuraCard
  HearItContext → useTTS → Kokoro (local TTS)
```

### During a lesson

```
AGENT 5 — Comfort Check Evaluator     backend/src/pipeline/evaluate.ts
  student answers exit mcq or comfort check
  Gemma rates: pass / partial / fail
  triggers backend/src/api/session.ts ▶ advance(graph, path, gameState, passed)
    pass     → status: mastered, mastery += 0.45, next node unlocks
    partial  → counts as pass (lenient)
    fail     → status: shaky, mastery -= 0.10
  if pass: AGENT 2+3 generate cards for next node (often prefetched)
  if fail: regenerate current node (gentler) and may inject a
          repair_card via the separate repair flow
```

### Ask Aura chat

```
AGENT 6 — Chat Reply                  backend/src/api/session.ts ▶ POST /chat/ask
  ChatOverlay sends sessionId + question + current card snippet
  one Gemma call with topic + active node + card context
  returns conversational reply (2-4 sentences)
  NO card generation, NO node advance, NO mastery mutation
```

### On-demand modes (WorkspaceOverviewScreen buttons)

```
Revise            POST /workspace/:sessionId/revise
  picks nodes with status=shaky OR mastery in (0, 0.6)
  runs AGENT 2+3 scoped to those nodes (cap 3)
  returns mixed cards

Test (per lesson) POST /workspace/:sessionId/test/:nodeId
  requires node.status === "mastered"
  runs AGENT 2+3 on that one node, then quiz-only filter
  filter set: mcq | fill_blank | true_false | quiz | recall | dragsort
  fallback to unfiltered if filter empties

Final test        POST /workspace/:sessionId/test
  requires all nodes mastered
  runs AGENT 2+3 across mastered nodes (cap 8), quiz-only filter
```

None of these three endpoints mutate graph, path, or gameState.

### Heuristic non-agents (frontend, no LLM)

```
useAttentionMonitor.ts
  3 window-blur events     → inject BreakCard
  90s stuck on one card    → inject ReflectCard
```

These are auto-injected client-side. Gemma is not in the loop.

### Card type matrix

| Type           | Gemma generates? | Renderer            | Notes                                      |
|----------------|------------------|---------------------|--------------------------------------------|
| text_explain   | yes              | ConceptCard         | core                                       |
| mcq            | yes              | QuizCard            | exit question per node required            |
| fill_blank     | yes              | RecallCard          | cloze with one blank                       |
| true_false     | yes              | QuizCard (adapted)  | misconception checks                       |
| recap          | yes              | RecapCard           | end-of-node summary required               |
| analogy        | yes              | AnalogyCard         |                                            |
| story          | yes              | StoryCard           |                                            |
| vocab          | yes              | VocabCard           | for keyTerms                               |
| visual         | yes              | VisualCard          |                                            |
| connection     | yes              | ConnectionCard      | bridge from previous node                  |
| flash          | yes              | FlashCard           |                                            |
| dragsort       | yes              | DragSortCard        | step sequencing                            |
| repair_card    | yes (repair flow)| RepairCard          | injected on shaky tutor turn               |
| break          | no (heuristic)   | BreakCard           | useAttentionMonitor injects                |
| reflect        | no (heuristic)   | ReflectCard         | useAttentionMonitor injects                |

### Infrastructure

- **LLM:** Gemma (`gemma-4-E2B-it`) served by LiteRT-LM at `http://localhost:8080` (Gemini-compatible API). GPU backend, MTP optional.
- **Backend:** Express on `:3101`. Orchestrates all agents through one broker:
  - `backend/src/llm/broker.ts` — `runGeminiJob` / `runGeminiBodyJob`
  - binary min-heap priority queue: foreground card generation preempts background prefetch
  - telemetry: queueMs, totalMs, approximate TTFT, tokens/sec, and rolling p50/p95/p99 latency
- **TTS:** Kokoro ONNX (`backend/src/api/tts.ts`), on-device, with a macOS `say` fallback.
- **STT:** optional Whisper (`backend/src/api/stt.ts`).
- **DB:** SQLite via `better-sqlite3` (`backend/src/db/store.ts`). Persists sessions, knowledge graphs, lesson paths, game states, and spaced-review cards.
- **Front-end:** React 19 + Zustand + Motion + Electron 35. Vite dev server on `:5174`.
- **Steady state:** zero outbound network calls — all inference, data, and audio run locally.

### End-to-end learning loop

1. User picks a topic (e.g. "CPU intro") and a learner profile (dyslexia/ADHD toggles).
2. **Agent 1** plans a 7–9 concept curriculum in one local Gemma call.
3. The workspace shows the lesson list with locked / active / mastered states.
4. Entering a lesson, **Agents 2+3** generate the first node's 5–8 cards on demand; the next node is prefetched in the background.
5. Cards adapt to the learner: chunked text, hear-it TTS, bionic-reading toggle, ADHD break/reflect prompts.
6. The exit question is scored by **Agent 5**; mastery updates and workspace stats refresh.
7. The Ask Aura overlay (**Agent 6**) answers free-form questions on the current card without leaving the lesson.
8. After mastery, a per-lesson **Test** generates a quiz-only run; once every node is mastered, a **Final test** unlocks a cross-node mixed quiz.
9. Shaky nodes surface a **Revise** action on the workspace.

The loop: learn → check → adapt → revise → test — all powered by one local model.

---

## Engineering & correctness

The two pieces of the system that are pure algorithms rather than glue around
the LLM — the **FSRS-5 spaced-repetition scheduler** (a probabilistic memory
model) and the **LLM broker** (a priority scheduler with latency telemetry) —
are covered by a deterministic test suite (`backend/test/`) that runs in CI.
`pnpm --dir backend test` runs everything in ~2s with no network, no live model,
and no wall-clock dependence.

### Validating the FSRS scheduler like a model, not a function

A spaced-repetition scheduler makes a falsifiable claim: *if you review a card
at the interval it prescribes, you will recall it with probability
`REQUEST_RETENTION` (0.9).* That is a model prediction, so it is validated the
way you validate a model — with invariants and a backtest.

**Invariants** (`fsrs.unit.test.ts`, `fsrs.properties.test.ts`). Property-based
tests (fast-check) drive fresh cards through thousands of random rating
histories and assert, after every step: difficulty stays within the canonical
`[1,10]` scale; stability stays above its floor; the interval is a positive
integer with `dueDate > lastReview`; `reps` increments once per review and
`lapses` increments **iff** the rating is *Again*; and scheduling is
order-preserving in stability.

**Bug found and fixed by these tests.** The property tests immediately failed
with `RangeError: Invalid time value`. Root cause: `difficulty` was clamped to
`[0,1]`, but the FSRS-5 stability equations (`11 - D`, `D^(-w)`) are the
canonical ones written for `D ∈ [1,10]`. When difficulty saturated at 0 (which
the initialisation formula does for *Good*/*Easy* ratings), a subsequent lapse
evaluated `0^(-0.05) = Infinity`, cascading `stability → Infinity → interval →
Infinity → Date overflow`. Fixed by moving difficulty onto the canonical
`[1,10]` scale and adding a 100-year interval cap (matching Anki's default).

**Retention backtest** (`fsrs.backtest.test.ts`). A deterministic (seeded PRNG +
fake timers) cohort of 400 cards is reviewed exactly at each prescribed due
date, and we check calibration — the analogue of a reliability diagram:

```
predicted   realized      n   |gap|
  0.794      0.809      89   0.015
  0.897      0.895    3225   0.002
  0.928      0.924    6686   0.004
```

Realized recall tracks predicted recall to within 1.5% in every populated bin.
For mature cards, predicted retention sits at ~0.92 and realized tracks it to
0.002 — slightly *above* the 0.9 target because rounding intervals to whole days
makes the cohort review a little more often than the continuous optimum, and by
Jensen's inequality on the convex forgetting curve that raises average retention
(a conservative bias). This is a *self-consistency* backtest; validating against
real human review logs is the natural next step.

### The LLM broker: scheduler correctness + tail latency

One local model serves every agent, so the broker (`backend/src/llm/broker.ts`)
multiplexes them through a priority queue — a foreground card generation
preempts background prefetch. The queue is a reusable **binary min-heap**
(`backend/src/util/minHeap.ts`, `O(log n)` push/pop) ordered by
`(priority, sequence)`: strict priority with a FIFO tie-break within a level.

Tests verify the heap drains to the sorted permutation of its input and holds
the min invariant under arbitrary interleaved push/pop (property-based), and
that the broker's exact comparator reproduces a reference stable sort. Job
telemetry maintains rolling windows and reports **p50/p95/p99** for total and
queue-wait latency — the percentiles that matter under queueing pressure.

### Write atomicity and input validation

Advancing a lesson writes three coupled artifacts (knowledge graph, lesson path,
game state). These are committed as a single atomic unit, `saveSessionArtifacts`
(`backend/src/db/store.ts`), wrapping the writes in a `better-sqlite3`
transaction; a test proves an injected mid-transaction failure rolls back every
write. Separately, every mutating HTTP route validates its body with zod
(`backend/src/api/validation.ts`) before the handler runs — the same rigor
already applied to untrusted model output in `cardSchemas.ts`.

---

## Setup

Install pnpm if needed:

```bash
npm install -g pnpm
```

Install dependencies:

```bash
pnpm run setup
```

Copy backend env:

```bash
cp backend/.env.example backend/.env
```

If your LiteRT-LM command differs from the default, edit `LLM_START_COMMAND` in
`backend/.env`.

## Run

Start backend, frontend, Electron, and local model orchestration:

```bash
pnpm start
```

Useful URLs:

- Frontend: `http://localhost:5174`
- Backend: `http://localhost:3101`
- Local LLM: `http://localhost:8080`

Shell wrapper:

```bash
./start-aura.sh
```

## Build & test

```bash
pnpm run build                   # typecheck backend + frontend

pnpm --dir backend test          # full test suite (~2s, no network/model)
pnpm --dir backend test:watch    # watch mode
pnpm --dir backend test:bench    # FSRS retention backtest + calibration table
```

CI (`.github/workflows/ci.yml`) runs the backend typecheck + test suite and a
frontend typecheck on every push and pull request.

## Repo map

```text
backend/    Express API, SQLite store, agent pipeline, local model orchestration
frontend/   React/Electron app and card renderers
scripts/    Cross-platform startup launcher
```

## Local-only guarantee

Aura does not call a hosted LLM. If Gemma/LiteRT-LM is unavailable, the backend
reports setup status instead of silently falling back to a remote model.
