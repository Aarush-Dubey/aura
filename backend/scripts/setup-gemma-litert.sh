#!/usr/bin/env bash
set -euo pipefail

MODEL="${LLM_LIT_MODEL_NAME:-gemma-4-E2B-it}"

if ! command -v lit >/dev/null 2>&1; then
  cat >&2 <<EOF
The LiteRT-LM 'lit' CLI is not installed.

Install it from the official LiteRT-LM instructions, then rerun:
  LLM_LIT_MODEL_NAME="$MODEL" bash scripts/setup-gemma-litert.sh
EOF
  exit 78
fi

if [ -z "${HUGGING_FACE_HUB_TOKEN:-}" ]; then
  cat >&2 <<EOF
HUGGING_FACE_HUB_TOKEN is not set.
Some LiteRT-LM models require a Hugging Face user access token before download.
EOF
fi

lit pull "$MODEL"
