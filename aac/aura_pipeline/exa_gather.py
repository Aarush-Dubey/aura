from __future__ import annotations

import re
from typing import Any

from exa_py import Exa

from .schemas import CurriculumInput, SourceChunk
from .settings import Settings


def query_variants(curriculum: CurriculumInput, topic: str) -> list[str]:
    base = f"{curriculum.subject} grade {curriculum.grade_level} {topic}"
    goals = " ".join(curriculum.learning_goals[:3])
    return [
        f"{base} clear explanation for students",
        f"{base} definition examples misconceptions",
        f"{base} prerequisite concepts learning sequence",
        f"{base} {goals} educational source",
    ]


def gather_chunks(curriculum: CurriculumInput, settings: Settings) -> list[SourceChunk]:
    if not settings.exa_api_key:
        raise RuntimeError("EXA_API_KEY is required. Add it to /home/jagat/aarush/aac/.env.")

    exa = Exa(settings.exa_api_key)
    chunks: list[SourceChunk] = []
    for topic in curriculum.topics:
        variants = query_variants(curriculum, topic)
        response = exa.search(
            variants[0],
            type="deep",
            additional_queries=variants[1:],
            num_results=settings.exa_results_per_query,
            contents={"text": {"maxCharacters": 12000}},
            system_prompt=(
                "Prefer accurate educational sources with clear explanations, examples, "
                "misconceptions, prerequisites, and age-appropriate language."
            ),
        )
        query = " | ".join(variants)
        for result in _results(response):
            title = str(_get(result, "title", ""))
            url = str(_get(result, "url", ""))
            text = _clean_text(str(_get(result, "text", "")))
            score = float(_get(result, "score", 0.0) or 0.0)
            if not url or len(text) < 180:
                continue
            chunks.extend(_chunk_text(topic, query, title, url, text, score, settings.chunk_chars))
    return chunks


def _results(response: Any) -> list[Any]:
    if hasattr(response, "results"):
        return list(response.results)
    if isinstance(response, dict):
        return list(response.get("results", []))
    return []


def _get(obj: Any, key: str, default: Any) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _chunk_text(
    topic: str,
    query: str,
    title: str,
    url: str,
    text: str,
    score: float,
    chunk_chars: int,
) -> list[SourceChunk]:
    chunks: list[SourceChunk] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_chars, len(text))
        if end < len(text):
            boundary = text.rfind(". ", start, end)
            if boundary > start + int(chunk_chars * 0.55):
                end = boundary + 1
        chunk_text = text[start:end].strip()
        if len(chunk_text) >= 180:
            chunks.append(
                SourceChunk(
                    topic=topic,
                    query=query,
                    title=title,
                    source_url=url,
                    text=chunk_text,
                    start_char=start,
                    end_char=end,
                    score=score,
                )
            )
        start = end
    return chunks
