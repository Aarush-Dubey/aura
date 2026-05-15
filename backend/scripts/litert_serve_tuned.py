"""Tuned LiteRT-LM Gemini/OpenAI HTTP server for Aura.

The stock `litert-lm serve` command in litert-lm 0.11.0 only exposes
host/port/api/verbose on the CLI. The Python Engine supports more useful
runtime settings, so this launcher wires them from environment variables while
keeping the stock HTTP handlers.
"""

from __future__ import annotations

import os
import sys

import click
import litert_lm
from litert_lm_cli import model
from litert_lm_cli import serve as stock_serve


def env_bool(name: str) -> bool | None:
  value = os.environ.get(name)
  if value is None or value == "":
    return None
  return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str) -> int | None:
  value = os.environ.get(name)
  if value is None or value == "":
    return None
  return int(value)


def tuned_get_engine(model_id: str) -> litert_lm.Engine:
  if stock_serve._current_model_id == model_id and stock_serve._current_engine is not None:
    return stock_serve._current_engine

  if stock_serve._current_engine is not None:
    stock_serve._current_engine.__exit__(None, None, None)
    stock_serve._current_engine = None
    stock_serve._current_model_id = None

  m = model.Model.from_model_id(model_id)
  if not m.exists():
    raise FileNotFoundError(f"Model {model_id} not found")

  backend_name = os.environ.get("LITERT_LM_BACKEND", "CPU").upper()
  backend = getattr(litert_lm.Backend, backend_name, litert_lm.Backend.CPU)
  max_tokens = env_int("LITERT_LM_MAX_TOKENS")
  cache_dir = os.environ.get("LITERT_LM_CACHE_DIR", "")
  speculative = env_bool("LITERT_LM_MTP")

  click.echo(click.style(f"Initializing tuned engine for model: {m.model_path}", fg="cyan"))
  click.echo(click.style(
      "Aura LiteRT-LM settings: "
      f"backend={backend_name}, "
      f"mtp={speculative}, "
      f"max_tokens={max_tokens}, "
      f"cache_dir={cache_dir or '<default>'}",
      fg="cyan",
  ))

  new_engine = litert_lm.Engine(
      m.model_path,
      backend=backend,
      max_num_tokens=max_tokens,
      cache_dir=cache_dir,
      enable_speculative_decoding=speculative,
  )
  new_engine.__enter__()
  stock_serve._current_engine = new_engine
  stock_serve._current_model_id = model_id
  return new_engine


def main() -> int:
  host = os.environ.get("LITERT_LM_HOST", "localhost")
  port = int(os.environ.get("LLM_PORT", os.environ.get("LITERT_LM_PORT", "8080")))
  api = os.environ.get("LITERT_LM_API", "gemini").lower()
  verbose = env_bool("LITERT_LM_VERBOSE")

  if verbose:
    litert_lm.set_min_log_severity(litert_lm.LogSeverity.VERBOSE)

  stock_serve.get_engine = tuned_get_engine
  if api == "gemini":
    handler = stock_serve.GeminiHandler
  elif api == "openai":
    handler = stock_serve.OpenAIHandler
  else:
    raise ValueError(f"Unsupported LITERT_LM_API: {api}")

  stock_serve.run_server(host, port, handler)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
