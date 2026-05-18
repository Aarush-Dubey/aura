import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import { Reading } from "../../text/BionicText";
import type { CardCtx } from "../CardRegistry";

type Data = {
  word: string;
  morphemes: { text: string; type: "prefix" | "root" | "suffix"; meaning: string }[];
  meaning: string;
  example: string;
  related: string[];
};

const MORPHEME_STYLES: Record<string, { bg: string; border: string; label: string }> = {
  prefix: { bg: "var(--aura-peach-wash)", border: "var(--aura-peach)", label: "prefix" },
  root: { bg: "var(--aura-sage-wash)", border: "var(--aura-sage)", label: "root" },
  suffix: { bg: "var(--aura-amber-wash)", border: "var(--aura-amber)", label: "suffix" },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function MorphemeCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  const [building, setBuilding] = useState(false);
  const [placed, setPlaced] = useState<number[]>([]);
  const [pool, setPool] = useState<number[]>([]);
  const [buildDone, setBuildDone] = useState(false);

  const startBuild = () => {
    setBuilding(true);
    setPlaced([]);
    setPool(shuffle(data.morphemes.map((_, i) => i)));
    setBuildDone(false);
  };

  const tapMorpheme = (idx: number) => {
    const next = [...placed, idx];
    setPlaced(next);
    setPool((p) => p.filter((x) => x !== idx));
    if (next.length === data.morphemes.length) {
      const correct = next.every((v, i) => v === i);
      setBuildDone(true);
      ctx.onAnswer?.(correct);
    }
  };

  const resetBuild = () => {
    setPlaced([]);
    setPool(shuffle(data.morphemes.map((_, i) => i)));
    setBuildDone(false);
  };

  const isCorrect = buildDone && placed.every((v, i) => v === i);

  return (
    <CardChrome tone="amber" label={t('wordParts')}>
      {/* Full word */}
      <div style={{ fontSize: 32, fontWeight: 600, color: "var(--aura-ink)", lineHeight: 1.2 }}>
        {data.word}
      </div>

      {/* Morpheme breakdown */}
      {!building && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.morphemes.map((m, i) => {
            const s = MORPHEME_STYLES[m.type];
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: m.type === "root" ? "12px 18px" : "10px 14px",
                  background: s.bg,
                  border: `1.5px solid ${s.border}`,
                  borderRadius: 12,
                }}
              >
                <span
                  style={{
                    fontSize: m.type === "root" ? 22 : 18,
                    fontWeight: m.type === "root" ? 700 : 600,
                    color: "var(--aura-ink)",
                  }}
                >
                  {m.text}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--aura-ink-mute)",
                    letterSpacing: ".04em",
                    textAlign: "center",
                  }}
                >
                  {s.label} &middot; {m.meaning}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Meaning + example */}
      <Reading bionic={ctx.bionic}>
        <p style={{ fontSize: 16, margin: 0 }}>{data.meaning}</p>
        <p style={{ fontStyle: "italic", color: "var(--aura-ink-soft)", fontSize: 14, margin: 0 }}>
          &ldquo;{data.example.split(data.word).map((part, i, arr) =>
            i < arr.length - 1 ? (
              <span key={i}>{part}<strong style={{ color: "var(--aura-ink)" }}>{data.word}</strong></span>
            ) : (
              <span key={i}>{part}</span>
            )
          )}&rdquo;
        </p>
      </Reading>

      {/* Related words */}
      {data.related.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--aura-ink-mute)", letterSpacing: ".04em" }}>
            {t('related')}
          </span>
          {data.related.map((w, i) => (
            <span
              key={i}
              style={{
                padding: "4px 10px",
                fontSize: 13,
                background: "var(--aura-paper-2)",
                border: "1px solid var(--aura-line)",
                borderRadius: 999,
                color: "var(--aura-ink-soft)",
              }}
            >
              {w}
            </span>
          ))}
        </div>
      )}

      {/* Build It interactive section */}
      {!building && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            className="btn btn--ghost"
            onClick={startBuild}
            style={{ fontSize: 14, padding: "8px 20px" }}
          >
            {t('buildIt')}
          </button>
        </div>
      )}

      {building && (
        <div
          className="rise"
          style={{
            background: "var(--aura-paper-2)",
            borderRadius: 12,
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--aura-ink-soft)" }}>
            {t('buildIt')}
          </div>

          {/* Placed slots */}
          <div style={{ display: "flex", gap: 6, minHeight: 44, flexWrap: "wrap" }}>
            {placed.map((idx, i) => {
              const m = data.morphemes[idx];
              const s = MORPHEME_STYLES[m.type];
              return (
                <span
                  key={i}
                  style={{
                    padding: "8px 14px",
                    fontSize: 16,
                    fontWeight: 600,
                    background: s.bg,
                    border: `1.5px solid ${s.border}`,
                    borderRadius: 10,
                    color: "var(--aura-ink)",
                  }}
                >
                  {m.text}
                </span>
              );
            })}
            {placed.length === 0 && (
              <span style={{ fontSize: 13, color: "var(--aura-ink-mute)", alignSelf: "center" }}>
                {t('tapMorphemesBelow')}
              </span>
            )}
          </div>

          {/* Pool of morphemes to pick from */}
          {!buildDone && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pool.map((idx) => {
                const m = data.morphemes[idx];
                return (
                  <button
                    key={idx}
                    onClick={() => tapMorpheme(idx)}
                    style={{
                      padding: "8px 16px",
                      fontSize: 15,
                      fontWeight: 600,
                      background: "var(--aura-paper)",
                      border: "1.5px solid var(--aura-line)",
                      borderRadius: 10,
                      cursor: "pointer",
                      font: "inherit",
                      color: "var(--aura-ink)",
                      transition: "all .15s",
                    }}
                  >
                    {m.text}
                  </button>
                );
              })}
            </div>
          )}

          {/* Result feedback */}
          {buildDone && (
            <div
              className="rise"
              style={{
                fontSize: 14,
                padding: "10px 14px",
                borderRadius: 10,
                background: isCorrect ? "var(--aura-sage-wash)" : "var(--aura-peach-wash)",
                color: isCorrect ? "var(--aura-sage-deep)" : "var(--aura-ink-soft)",
                fontWeight: 500,
              }}
            >
              {isCorrect ? t('perfectBuild') : t('tryAgainBuild')}
            </div>
          )}

          {buildDone && !isCorrect && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn--ghost" onClick={resetBuild} style={{ fontSize: 13 }}>
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
