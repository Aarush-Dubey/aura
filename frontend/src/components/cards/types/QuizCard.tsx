import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Data = {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
};

export function QuizCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const isTest = ctx.testMode === true;

  return (
    <CardChrome tone="sage" label={isTest ? t('testQuestion', 'Test') : t('quickCheck')} sub={isTest ? t('answersAtEnd', 'Answers revealed at the end') : t('noPenalty')}>
      <h2 className="title" style={{ fontSize: 24, margin: 0, lineHeight: 1.3 }}>{data.question}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.options.map((o, i) => {
          const isPicked = picked === i;
          const showResult = revealed && !isTest;
          const isRight = showResult && i === data.correct;
          const isWrong = showResult && isPicked && i !== data.correct;
          let bg = "var(--aura-paper-2)";
          let bd = "var(--aura-line)";
          if (isRight) { bg = "var(--aura-sage-wash)"; bd = "var(--aura-sage)"; }
          else if (isWrong) { bg = "var(--aura-clay-soft)"; bd = "var(--aura-clay)"; }
          else if (isPicked) { bg = isTest ? "var(--aura-sage-wash)" : "var(--aura-paper)"; bd = isTest ? "var(--aura-sage)" : "var(--aura-ink-soft)"; }
          return (
            <button
              key={i}
              onClick={() => {
                if (!revealed) {
                  setPicked(i);
                  setRevealed(true);
                  ctx.onAnswer?.(i === data.correct);
                }
              }}
              style={{
                textAlign: "left",
                padding: "14px 18px",
                borderRadius: 12,
                border: `1.5px solid ${bd}`,
                background: bg,
                cursor: revealed ? "default" : "pointer",
                font: "inherit",
                color: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 12,
                transition: "all .2s",
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  background: "var(--aura-paper)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "JetBrains Mono",
                  fontSize: 12,
                  color: "var(--aura-ink-mute)",
                  border: "1px solid var(--aura-line)",
                }}
              >
                {["A", "B", "C", "D"][i]}
              </span>
              <span style={{ flex: 1 }}>{o}</span>
              {isRight && <span style={{ color: "var(--aura-sage-deep)", fontSize: 12, fontWeight: 600 }}>{t('correct')}</span>}
              {isWrong && <span style={{ color: "var(--aura-clay)", fontSize: 12, fontWeight: 600 }}>{t('notThisOne')}</span>}
              {isTest && isPicked && <span style={{ color: "var(--aura-sage-deep)", fontSize: 12, fontWeight: 600 }}>{t('selected', 'Selected')}</span>}
            </button>
          );
        })}
      </div>
      {revealed && !isTest && (
        <div
          className="rise"
          style={{
            background: "var(--aura-sage-wash)",
            padding: "14px 18px",
            borderRadius: 12,
            fontSize: 14,
            color: "var(--aura-ink-soft)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--aura-ink)" }}>{t('why')}</strong> {data.explanation}
        </div>
      )}
      {revealed && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn--sage" onClick={ctx.onNext}>{t('common:next')}</button>
        </div>
      )}
    </CardChrome>
  );
}
