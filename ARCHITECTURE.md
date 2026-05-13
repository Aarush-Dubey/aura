# Aura — Agentic Architecture

Local, fully on-device tutor. Gemma 4 (LiteRT-LM) plus a thin Express orchestrator and a React/Electron front-end. Zero cloud calls in the steady state.

## Pipeline at a glance

```
INPUT
  user types topic + intent  (image upload backend exists; UI orphan)
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

## During a lesson

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

## Ask Aura chat

```
AGENT 6 — Chat Reply                  backend/src/api/session.ts ▶ POST /chat/ask
  ChatOverlay sends sessionId + question + current card snippet
  one Gemma call with topic + active node + card context
  returns conversational reply (2-4 sentences)
  NO card generation, NO node advance, NO mastery mutation
```

## On-demand modes (WorkspaceOverviewScreen buttons)

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

## Heuristic non-agents (frontend, no LLM)

```
useAttentionMonitor.ts
  3 window-blur events     → inject BreakCard
  90s stuck on one card    → inject ReflectCard
```

These are auto-injected client-side. Gemma is not in the loop.

## Card type matrix

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

## Infrastructure

- **LLM**: Gemma 4 (`gemma-4-E2B-it`) served by LiteRT-LM at `http://localhost:8080` (Gemini-compatible API). GPU backend, MTP optional.
- **Backend**: Express on `:3101`. Orchestrates all agents through one broker:
  - `backend/src/llm/broker.ts` — `runGeminiJob` / `runGeminiBodyJob`
  - priority queue: foreground card gen preempts background prefetch
  - telemetry: queueMs, totalMs, approximate TTFT, tokens/sec
- **TTS**: Kokoro ONNX (`backend/src/api/tts.ts`). On-device. Fallback to macOS `say`.
- **STT**: optional (`backend/src/api/stt.ts`).
- **DB**: sqlite via `better-sqlite3` (`backend/src/db/store.ts`). Persists:
  - `sessions` — id, topic, startedAt, graph_id, lesson_path_id, history_json
  - `graphs`, `paths`, `game_states`
- **Front-end**: React 19 + Zustand + Motion + Electron 35. Vite dev server on `:5174`.
- **Steady state**: zero outbound network calls. All inference, all data, all audio runs locally.

## Demo arc (judging story)

1. User picks topic ("CPU intro") + learner profile (dyslexia/ADHD toggles).
2. **Agent 1** plans 7-9 concept curriculum in one local Gemma call.
3. WorkspaceOverview shows the lesson list, locked/active/mastered states.
4. User enters lesson — **Agent 2+3** generate the first node's 5-8 cards on demand. Next node prefetched in background.
5. Cards adapt to the learner: chunked text, Hear-it TTS, Bionic reading toggle, ADHD break/reflect prompts.
6. Exit question scored by **Agent 5**. Mastery updates. Workspace stats refresh.
7. Ask Aura overlay (**Agent 6**) handles free-form questions on the current card without leaving the lesson.
8. After mastery, per-lesson **Test** button on the row generates a quiz-only run. Once every node mastered, **Final test** button unlocks for a cross-node mixed quiz.
9. Shaky nodes surface a **Revise** button on the workspace.

Loop: learn → check → adapt → revise → test. All powered by one local model.
