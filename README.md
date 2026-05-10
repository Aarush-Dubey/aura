# Aura

Aura is a fully local desktop learning app. The current main flow uses local Gemma to plan a lesson graph from the learner's topic, goal, and saved profile, then expands each node into lecture cards.

## Start The App

Run once after cloning:

```powershell
npm run setup
```

Then start everything with one command from the repo root:

```powershell
npm start
```

That one command starts:

- Vite frontend on `http://localhost:5174`
- Electron desktop shell
- Backend API on `http://localhost:3001`
- Local Gemma through the backend LLM startup protocol, when configured

If Gemma/LiteRT-LM is not installed or configured, the backend will report `setup_required` instead of silently falling back to a paid or remote model.

## Local LLM Rule

Aura is designed to use local Gemma only. Do not use OpenAI or another remote LLM for lesson generation.

Useful environment values:

```powershell
$env:LLM_AUTOSTART="true"
$env:LLM_START_COMMAND="litert-lm serve --api gemini --port 8080"
$env:LLM_BASE_URL="http://localhost:8080"
$env:LLM_MODEL="gemma-4-E2B-it"
```

If your LiteRT-LM command is different, set `LLM_START_COMMAND` to the command that serves Gemma locally on port `8080`.

## Current Lesson Pipeline

The main pipeline is:

1. User enters topic, goal, depth, and learner mode.
2. Backend loads the saved learner profile.
3. Gemma plans an ordered list of lesson nodes from topic + goal + profile.
4. Each planned item becomes one graph node.
5. The app derives a linear lesson plan from that graph.
6. Gemma expands the active node into lecture cards.
7. Selecting another node asks Gemma to expand that node.

Cache behavior:

- Auto cache matching does not override the main Gemma-planned path.
- Exa/Orien cache is used only when explicitly selected in the UI.
- `AURA_ORIEN_MODE=gemma_knowledge` generates chunks from local Gemma knowledge only.

## Graph Shape

Right now, the generated graph is mostly linear by design. Gemma produces a prerequisite sequence, and the app connects each node to the next node.

The graph data structure supports non-linear edges, repair nodes, and application nodes, but the current planner does not yet create branches by default. A good next upgrade is to let Gemma emit:

- core path nodes
- optional support nodes
- repair nodes for likely misconceptions
- application branches

Then the map can become a real branching knowledge graph instead of a mostly linear plan.
