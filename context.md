# Aura Project Context Transfer

Use this file to start a new coding or design chat with full project context.

## Hard Rules

- Aura is a fully local desktop learning app.
- Main lesson generation must use local Gemma 4 only.
- Do not use OpenAI, Claude, Exa, or any remote model in the production lesson path.
- LiteRT-LM is the local runtime/server for Gemma.
- If Gemma/LiteRT-LM is not available, the app must report setup required. It must not silently fall back to a paid or cloud model.
- Exa/Orien/cache code may remain for explicit testing, but it must not override the main Gemma-only path.
- Do not expose private chain-of-thought. Use short structured reasons such as `orderReason`, `prerequisiteReason`, and `learnerFitReason`.
- If the user says server or SSH server, connect to `jagat@172.24.16.155`.
- Be honest and critical. Do not agree with incorrect assumptions just to be agreeable.

## Current Stack

- Repo: `C:\Users\Aarush\Desktop\aura`
- GitHub: `https://github.com/Aarush-Dubey/aura.git`
- Desktop shell: Electron
- Frontend: Vite + React + TypeScript
- Backend: Node/Express + TypeScript
- Local model runtime: LiteRT-LM
- Current model: `gemma-4-E2B-it`
- Frontend URL: `http://localhost:5174`
- Backend URL: `http://localhost:3001`
- LiteRT-LM URL: `http://localhost:8080`

## How To Start

From the repo root:

```bash
npm start
```

or, from macOS/Linux/Git Bash/WSL:

```bash
sh ./start-aura.sh
```

The launcher:

- installs missing backend/frontend Node dependencies
- starts the backend
- asks the backend to start local Gemma through LiteRT-LM if needed
- starts Vite and Electron
- skips Electron's internal backend spawn to avoid Windows spawn issues
- writes logs to `logs/`

Implementation note: `npm start` runs `node ./scripts/start-aura.mjs`, which works on Windows without WSL. `start-aura.sh` is a thin shell wrapper around that Node launcher.

Useful environment variables:

```bash
LLM_AUTOSTART=true
LLM_BASE_URL=http://localhost:8080
LLM_MODEL=gemma-4-E2B-it
LLM_START_COMMAND="litert-lm serve --api gemini --port 8080"
LLM_USE_FOR_CARDS=true
LLM_USE_FOR_EVALUATION=true
LITERT_LM_BACKEND=gpu
```

## Current Lesson Pipeline

1. User enters a topic, goal, depth, and learner mode.
2. Backend loads the learner profile.
3. Gemma plans a comprehensive topic graph from topic + goal + profile.
4. Nodes can have roles:
   - `core`
   - `bridge`
   - `repair`
   - `practice`
   - `application`
5. Gemma provides `dependsOn` dependencies for graph edges.
6. Backend derives a linear teaching path from graph dependencies with topological ordering.
7. Gemma plans a 4 to 6 card node lecture.
8. Gemma generates cards one by one.
9. Gemma performs a final redundancy and voice polish pass.
10. Frontend reveals lesson cards progressively.

## Graph Behavior

Gemma should create a comprehensive map, not a tiny chain.

Expected coverage:

- entry intuition
- vocabulary/terms
- representation or sample space
- core rule/formula/mechanism
- special cases
- worked example
- misconception repair
- guided practice
- final application/payoff

Smoke test result previously seen for `probability class 10`:

- 9 nodes
- 10 edges
- included repair, application, and practice nodes

## Tutor Voice

Aura's tutor voice is now a frozen engineering artifact:

- File: `AURA_TUTOR_VOICE_SPEC.md`
- Code: `backend/src/llm/voice.ts`

Target voice:

- calm
- direct
- warm-but-not-bubbly
- second-person
- 6th to 8th grade reading level
- short sentences
- no fake enthusiasm
- no emoji in generated tutor text
- no trait praise
- no shame language

Banned phrases include:

- "Great question"
- "Let's dive in"
- "As an AI"
- "Absolutely"
- "Amazing"
- "Perfect"
- "You're so smart"
- "Don't worry"
- "You've got this"
- "Nice try"
- "Easy one"

Correct feedback should use process acknowledgment:

- "Right. The useful move was clearing the fraction first."

Wrong-answer feedback should use:

1. normalize the sticking point
2. diagnose the specific issue
3. give one concrete next step

## Neurodivergent Design Goals

Aura is specifically for neurodivergent learners, especially students with:

- ADHD
- dyslexia
- anxiety around learning
- low confidence
- difficulty staying engaged with long linear explanations

Design principles:

- one idea at a time
- short loops
- visible progress
- examples before formulas
- low-shame feedback
- minimal clutter
- optional focus mode
- readable typography
- math read-aloud lines
- repair when stuck instead of repeated failure

## Gamification Direction

Gamification should be quiet and useful, not childish.

Use:

- mastery rings
- node unlocks
- short quests
- XP for effort, correction, and completion
- repair wins
- final application challenge
- review queue for shaky nodes

Avoid:

- loud confetti
- emoji-heavy tutor text
- childish badges
- leaderboards
- shame-based streaks
- "perfect" streaks

Recommended game states:

- `locked`
- `ready`
- `active`
- `seen`
- `shaky`
- `repairing`
- `mastered`
- `review_due`

Recommended mastery layers:

- seen
- practiced
- mastered
- repaired

## Important Files

- `scripts/start-aura.mjs`: cross-platform Node launcher.
- `start-aura.sh`: shell wrapper around the Node launcher.
- `context.md`: this transfer file.
- `README.md`: startup and architecture notes.
- `AURA_TUTOR_VOICE_SPEC.md`: frozen tutor voice contract.
- `CLAUDE_PEDAGOGY_RESEARCH_BRIEF.md`: research prompt for pedagogy/design.
- `backend/src/llm/prompts.ts`: graph and evaluation prompts.
- `backend/src/llm/voice.ts`: voice spec, banned phrases, voice validation.
- `backend/src/pipeline/buildGraph.ts`: Gemma graph generation.
- `backend/src/pipeline/linearize.ts`: graph-to-linear path logic.
- `backend/src/pipeline/cardGenerator.ts`: card planning, one-card generation, polish, voice rewrite.
- `frontend/src/App.tsx`: main UI.
- `frontend/src/api/client.ts`: frontend API client.
- `frontend/electron/main.cjs`: Electron shell and backend spawning behavior.

## Known Current Gaps

- No full gamification system yet.
- No durable learner mastery model yet.
- No spaced review queue yet.
- No scoped chat/hint panel yet.
- No robust wrong-answer repair flow after repeated misses yet.
- No hand-written few-shot examples per card type yet.
- Voice validation exists, but readability checking is basic.
- Startup script is bash-based; on Windows it expects Git Bash, WSL, or another bash environment.

## Recommended Next Build Steps

1. Add hand-written few-shot examples per card type.
2. Split generic card body into more pedagogical fields.
3. Implement wrong-answer repair flow:
   - first miss: hint
   - second miss: worked example
   - then a parallel problem
4. Add local learner model:
   - mastery
   - confidence
   - misconceptions
   - review due
5. Add quiet gamification:
   - mastery rings
   - node state
   - XP for repair and effort
   - final application challenge
6. Add optional node-scoped hint/chat panel.
7. Add dyslexia/ADHD reading controls:
   - font size
   - line spacing
   - reduced motion
   - high contrast
   - formula read-aloud

## Recent Implementation Notes

- Gemma-only graph planning was expanded to create comprehensive dependency graphs.
- Card generation now happens one card at a time.
- Entry questions are optional.
- Gemma judges redundancy and rewrites final lecture cards.
- Aura voice spec is injected into prompts.
- Voice violations trigger a rewrite pass.
- `npm run build` passed after the voice work.

## Git Hygiene

Do not commit unrelated untracked local files such as:

- `aac/outputs/cache/orien_804564f65b04ca/`
- `extract.py`
- `allotment.json`

These appeared locally and are not part of the intended Aura implementation unless the user explicitly asks for them.
