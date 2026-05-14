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
  const [done, setDone] = useState(false);
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
    setDone(ok);
    ctx.onAnswer?.(ok);
  };

  return (
    <CardChrome tone="peach" label={t('sortIt')} sub={t('dragIntoOrder')}>
      <h2 className="title" style={{ fontSize: 22, margin: 0, lineHeight: 1.3 }}>{data.prompt}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {order.map((step, i) => (
          <div
            key={step}
            draggable
            onDragStart={onDragStart(i)}
            onDragOver={onDragOver(i)}
            onDrop={onDrop}
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              background: "var(--aura-paper-2)",
              border: "1.5px solid var(--aura-line)",
              display: "flex",
              gap: 12,
              alignItems: "center",
              cursor: "grab",
              userSelect: "none",
            }}
          >
            <span style={{ color: "var(--aura-ink-mute)", fontFamily: "JetBrains Mono", fontSize: 12, width: 18 }}>{i + 1}</span>
            <span style={{ color: "var(--aura-ink-mute)", fontSize: 14, display: "inline-flex", flexDirection: "column", gap: 2 }}>
              <span style={{ width: 14, height: 1.5, background: "var(--aura-ink-mute)" }} />
              <span style={{ width: 14, height: 1.5, background: "var(--aura-ink-mute)" }} />
              <span style={{ width: 14, height: 1.5, background: "var(--aura-ink-mute)" }} />
            </span>
            <span style={{ flex: 1 }}>{data.steps[step]}</span>
          </div>
        ))}
      </div>
      {done && (
        <div className="rise" style={{ background: "var(--aura-sage-wash)", padding: "14px 18px", borderRadius: 12, fontSize: 14, color: "var(--aura-ink-soft)" }}>
          <strong style={{ color: "var(--aura-ink)" }}>{t('perfectOrder')}</strong> {data.explanation}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {!done && <button className="btn btn--sage" onClick={check}>{t('checkOrder')}</button>}
        {done && <button className="btn btn--sage" onClick={ctx.onNext}>{t('common:continue')}</button>}
      </div>
    </CardChrome>
  );
}
