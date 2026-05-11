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

Or run the shell wrapper directly from macOS, Linux, Git Bash, or WSL:

```bash
sh ./start-aura.sh
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

The launcher checks for missing `backend/node_modules` or `frontend/node_modules` and runs `npm run setup` when needed. It also asks the backend to start local Gemma if no LiteRT-LM server is already reachable.

On Windows, `npm start` uses the cross-platform Node launcher directly, so it does not require WSL. The `start-aura.sh` wrapper is for shell environments that can run `sh`.

## Current Lesson Pipeline

The main pipeline is:

1. User enters topic, goal, depth, and learner mode.
2. Backend loads the saved learner profile.
3. Gemma plans a comprehensive topic graph from topic + goal + profile.
4. Each planned item becomes one graph node with a role such as `core`, `bridge`, `repair`, `practice`, or `application`.
5. The app derives a linear lesson plan from the graph dependencies.
6. Gemma expands the active node into lecture cards.
7. Selecting another node asks Gemma to expand that node.

Cache behavior:

- Auto cache matching does not override the main Gemma-planned path.
- Exa/Orien cache is used only when explicitly selected in the UI.
- `AURA_ORIEN_MODE=gemma_knowledge` generates chunks from local Gemma knowledge only.

## Graph Shape

Gemma now produces a fuller graph-like plan instead of only a short chain. It can include core nodes, bridge/support nodes, repair nodes for likely misconceptions, and application/practice nodes.

The app still derives a linear teaching path for the current lesson flow, but that path is computed from graph dependencies rather than assuming each node simply points to the next one.

For example, a repair node can branch from a core probability rule, while a final application node can depend on multiple earlier nodes.
