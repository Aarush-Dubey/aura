import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Data = {
  prompt: string;
  steps: Record<string, string>;
  shuffled: string[];
  correct: string[];
  explanation: string;
};

export function DragSortCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  const [order, setOrder] = useState(() => [...data.shuffled]);
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [attempts, setAttempts] = useState(0);
  const dragIdx = useRef<number | null>(null);

  const onDragStart = (i: number) => (e: React.DragEvent) => {
    dragIdx.current = i;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    setOrder((o) => {
      const n = [...o];
      const [m] = n.splice(dragIdx.current!, 1);
      n.splice(i, 0, m);
      dragIdx.current = i;
      return n;
    });
  };
  const onDrop = () => { dragIdx.current = null; };
  const check = () => {
    const ok = order.every((x, i) => x === data.correct[i]);
    setResult(ok ? "correct" : "wrong");
    setAttempts(a => a + 1);
    ctx.onAnswer?.(ok);
  };
  const retry = () => {
    setResult(null);
    setOrder([...data.shuffled].sort(() => Math.random() - 0.5));
  };
  const showAnswer = () => {
    setOrder([...data.correct]);
    setResult("correct");
  };

  return (
    <CardChrome tone="peach" label={t('sortIt')} sub={t('dragIntoOrder')}>
      <h2 className="title" style={{ fontSize: 22, margin: 0, lineHeight: 1.3 }}>{data.prompt}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {order.map((step, i) => {
          const isCorrectSpot = result && step === data.correct[i];
          const isWrongSpot = result === "wrong" && step !== data.correct[i];
          return (
            <div
              key={step}
              draggable={!result}
              onDragStart={!result ? onDragStart(i) : undefined}
              onDragOver={!result ? onDragOver(i) : undefined}
              onDrop={!result ? onDrop : undefined}
              style={{
                padding: "14px 16px",
                borderRadius: 12,
                background: isCorrectSpot ? "var(--aura-sage-wash)" : isWrongSpot ? "var(--aura-amber-wash)" : "var(--aura-paper-2)",
                border: `1.5px solid ${isCorrectSpot ? "var(--aura-sage)" : isWrongSpot ? "var(--aura-amber)" : "var(--aura-line)"}`,
                display: "flex",
                gap: 12,
                alignItems: "center",
                cursor: result ? "default" : "grab",
                userSelect: "none",
                transition: "all .2s",
              }}
            >
              <span style={{ color: "var(--aura-ink-mute)", fontFamily: "JetBrains Mono", fontSize: 12, width: 18 }}>{i + 1}</span>
              {!result && (
                <span style={{ color: "var(--aura-ink-mute)", fontSize: 14, display: "inline-flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ width: 14, height: 1.5, background: "var(--aura-ink-mute)" }} />
                  <span style={{ width: 14, height: 1.5, background: "var(--aura-ink-mute)" }} />
                  <span style={{ width: 14, height: 1.5, background: "var(--aura-ink-mute)" }} />
                </span>
              )}
              <span style={{ flex: 1 }}>{data.steps[step]}</span>
            </div>
          );
        })}
      </div>
      {result === "correct" && (
        <div className="rise" style={{ background: "var(--aura-sage-wash)", padding: "14px 18px", borderRadius: 12, fontSize: 14, color: "var(--aura-ink-soft)" }}>
          <strong style={{ color: "var(--aura-ink)" }}>{t('perfectOrder')}</strong> {data.explanation}
        </div>
      )}
      {result === "wrong" && (
        <div className="rise" style={{ background: "var(--aura-amber-wash)", padding: "14px 18px", borderRadius: 12, fontSize: 14, color: "var(--aura-ink-soft)" }}>
          <strong style={{ color: "var(--aura-ink)" }}>{t('almostThere', 'Almost there')}</strong> {t('tryReorderingHint', 'Some steps are out of place. Try again or see the answer.')}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {!result && <button className="btn btn--sage" onClick={check}>{t('checkOrder')}</button>}
        {result === "wrong" && (
          <>
            <button className="btn btn--ghost" onClick={showAnswer}>{t('showAnswer', 'Show answer')}</button>
            <button className="btn btn--sage" onClick={retry}>{t('tryAgain', 'Try again')}</button>
          </>
        )}
        {result === "correct" && <button className="btn btn--sage" onClick={ctx.onNext}>{t('common:continue')}</button>}
      </div>
    </CardChrome>
  );
}
