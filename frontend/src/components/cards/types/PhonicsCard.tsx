import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import { Reading } from "../../text/BionicText";
import type { CardCtx } from "../CardRegistry";

type Data = {
  grapheme: string;
  phoneme: string;
  examples: { word: string; highlighted: string }[];
  rule: string;
};

function HighlightGrapheme({ word, highlighted }: { word: string; highlighted: string }) {
  const idx = word.toLowerCase().indexOf(highlighted.toLowerCase());
  if (idx === -1) return <span>{word}</span>;
  return (
    <span>
      {word.slice(0, idx)}
      <span style={{ color: "var(--aura-sage-deep)", fontWeight: 700, background: "var(--aura-sage-wash)", padding: "1px 3px", borderRadius: 4 }}>
        {word.slice(idx, idx + highlighted.length)}
      </span>
      {word.slice(idx + highlighted.length)}
    </span>
  );
}

export function PhonicsCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  const [exerciseActive, setExerciseActive] = useState(false);
  const [tapped, setTapped] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState(false);

  // Build exercise: pick up to 3 examples, determine which contain the grapheme
  const exerciseWords = data.examples.slice(0, 3);
  const correctIndices = new Set(
    exerciseWords
      .map((ex, i) => (ex.word.toLowerCase().includes(data.grapheme.toLowerCase()) ? i : -1))
      .filter((i) => i >= 0)
  );

  const toggleTap = (i: number) => {
    if (checked) return;
    setTapped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const checkAnswers = () => {
    setChecked(true);
    const correct =
      tapped.size === correctIndices.size &&
      [...tapped].every((i) => correctIndices.has(i));
    ctx.onAnswer?.(correct);
  };

  const resetExercise = () => {
    setTapped(new Set());
    setChecked(false);
  };

  const allCorrect =
    checked &&
    tapped.size === correctIndices.size &&
    [...tapped].every((i) => correctIndices.has(i));

  return (
    <CardChrome tone="sky" label={t('soundSpotlight')}>
      {/* Grapheme + phoneme display */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "8px 0" }}>
        <div style={{ fontSize: 48, fontWeight: 700, color: "var(--aura-ink)", lineHeight: 1 }}>
          {data.grapheme}
        </div>
        <div style={{ fontSize: 13, color: "var(--aura-ink-mute)", letterSpacing: ".04em" }}>
          {t('makesTheSound')}
        </div>
        <div style={{ fontFamily: "JetBrains Mono", fontSize: 28, fontWeight: 600, color: "var(--aura-sage-deep)" }}>
          {data.phoneme}
        </div>
      </div>

      {/* Rule box */}
      <Reading bionic={ctx.bionic}>
        <div
          style={{
            background: "var(--aura-sage-wash)",
            padding: "14px 18px",
            borderRadius: 12,
            fontSize: 14,
            color: "var(--aura-ink-soft)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--aura-ink)" }}>{t('rule')}</strong>{" "}
          {data.rule}
        </div>
      </Reading>

      {/* Example words */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.examples.map((ex, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: "var(--aura-paper-2)",
              border: "1px solid var(--aura-line)",
              borderRadius: 10,
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 500 }}>
              <HighlightGrapheme word={ex.word} highlighted={ex.highlighted} />
            </span>
            <button
              className="btn btn--ghost"
              onClick={() => ctx.onHearIt?.()}
              style={{ padding: "4px 12px", fontSize: 12 }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M5 9v6h4l5 5V4L9 9H5z" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                {t('hearIt')}
              </span>
            </button>
          </div>
        ))}
      </div>

      {/* Tap the sound exercise */}
      {!exerciseActive && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            className="btn btn--ghost"
            onClick={() => setExerciseActive(true)}
            style={{ fontSize: 14, padding: "8px 20px" }}
          >
            {t('tapTheSound')}
          </button>
        </div>
      )}

      {exerciseActive && (
        <div
          className="rise"
          style={{
            background: "var(--aura-paper-2)",
            borderRadius: 12,
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--aura-ink-soft)" }}>
            {t('tapWordsWithSound', { grapheme: data.grapheme, phoneme: data.phoneme })}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {exerciseWords.map((ex, i) => {
              const isSelected = tapped.has(i);
              const isCorrectAnswer = correctIndices.has(i);
              let bg = "var(--aura-paper)";
              let border = "var(--aura-line)";
              if (checked && isSelected && isCorrectAnswer) {
                bg = "var(--aura-sage-wash)";
                border = "var(--aura-sage)";
              } else if (checked && isSelected && !isCorrectAnswer) {
                bg = "var(--aura-peach-wash)";
                border = "var(--aura-peach)";
              } else if (checked && !isSelected && isCorrectAnswer) {
                bg = "var(--aura-amber-wash)";
                border = "var(--aura-amber)";
              } else if (isSelected) {
                bg = "var(--aura-paper)";
                border = "var(--aura-ink-soft)";
              }
              return (
                <button
                  key={i}
                  onClick={() => toggleTap(i)}
                  style={{
                    padding: "10px 18px",
                    fontSize: 16,
                    fontWeight: 500,
                    background: bg,
                    border: `1.5px solid ${border}`,
                    borderRadius: 10,
                    cursor: checked ? "default" : "pointer",
                    font: "inherit",
                    color: "var(--aura-ink)",
                    transition: "all .15s",
                  }}
                >
                  {ex.word}
                </button>
              );
            })}
          </div>

          {!checked && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn--sage"
                onClick={checkAnswers}
                disabled={tapped.size === 0}
                style={{ fontSize: 13, opacity: tapped.size === 0 ? 0.5 : 1 }}
              >
                {t('check')}
              </button>
            </div>
          )}

          {checked && (
            <div
              className="rise"
              style={{
                fontSize: 14,
                padding: "10px 14px",
                borderRadius: 10,
                background: allCorrect ? "var(--aura-sage-wash)" : "var(--aura-peach-wash)",
                color: allCorrect ? "var(--aura-sage-deep)" : "var(--aura-ink-soft)",
                fontWeight: 500,
              }}
            >
              {allCorrect ? t('correctTapSound') : t('notQuiteTapSound')}
            </div>
          )}

          {checked && !allCorrect && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn--ghost" onClick={resetExercise} style={{ fontSize: 13 }}>
                {t('tryAgain')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Next button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn--sage" onClick={ctx.onNext}>{t('common:next')}</button>
      </div>
    </CardChrome>
  );
}
