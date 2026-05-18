# Aura

Aura is a local-first desktop tutor built for hackathon demos. It uses a React/Electron frontend, an Express/SQLite backend, local Gemma through LiteRT-LM for lesson planning, and local Kokoro TTS for audio.

## Demo Flow

1. Choose language, topic, goal, depth, and learner mode.
2. Aura builds a concept graph from the saved learner profile.
3. Lesson cards are generated node-by-node from the local model.
4. Exit checks update mastery and unlock the next node.
5. Review and test modes surface shaky concepts.

## Tech Stack

- Frontend: React 19, Vite, Electron, Zustand, Motion
- Backend: Express, TypeScript, SQLite
- AI runtime: Gemma served locally with LiteRT-LM
- Audio: Kokoro TTS with macOS `say` fallback
- Package manager: pnpm

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

If your LiteRT-LM command differs from the default, edit `LLM_START_COMMAND` in `backend/.env`.

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

## Build Check

```bash
pnpm run build
```

## Repo Map

```text
backend/    Express API, SQLite store, local model orchestration
frontend/   React/Electron app and card renderers
aac/        Small pipeline examples and research helpers
scripts/    Cross-platform startup launcher
```

## Local-Only Rule

Aura should not call a hosted LLM during demos. If Gemma/LiteRT-LM is unavailable, the backend reports setup status instead of silently using a remote model.
