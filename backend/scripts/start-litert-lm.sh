#!/usr/bin/env bash
set -euo pipefail

PORT="${LLM_PORT:-8080}"
MODEL_PATH="${LLM_MODEL_PATH:-./models/gemma-4-E2B-it-litert-lm}"
MODEL_REPO="${LLM_MODEL_REPO:-litert-community/gemma-4-E2B-it-litert-lm}"
LIT_MODEL_NAME="${LLM_LIT_MODEL_NAME:-gemma-4-E2B-it}"

if [ -n "${LITERT_LM_START_COMMAND:-}" ]; then
  exec bash -lc "$LITERT_LM_START_COMMAND"
fi

if command -v litert-lm >/dev/null 2>&1; then
  exec litert-lm serve --api gemini --port "$PORT"
fi

cat >&2 <<EOF
Aura could not start LiteRT-LM because no runtime command is configured.

Expected local model:
  $MODEL_REPO

Expected LiteRT-LM lit model name:
  $LIT_MODEL_NAME

Expected local path:
  $MODEL_PATH

Set one of these in backend/.env:
  LLM_START_COMMAND='litert-lm serve --api gemini --port $PORT'
  LITERT_LM_START_COMMAND='actual command that serves local Gemma through LiteRT-LM on :$PORT'
  or
  LLM_START_COMMAND='actual command that serves local Gemma through LiteRT-LM on :$PORT'

If you use Google's LiteRT-LM CLI:
  1. install the lit CLI
  2. export HUGGING_FACE_HUB_TOKEN if the model requires it
  3. import the Gemma LiteRT-LM file
  4. run: litert-lm serve --api gemini --port "$PORT"

The backend does not assume the host already has LiteRT-LM or Gemma installed.
EOF

exit 78
