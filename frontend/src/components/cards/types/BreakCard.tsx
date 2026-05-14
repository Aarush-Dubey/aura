import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Data = {
  prompt?: string;
  body?: string;
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function BreakCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t: tr } = useTranslation("cards");
  const [t, setT] = useState(60);

  useEffect(() => {
    const id = setInterval(() => setT((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <CardChrome tone="peach" label={tr('brainBreak')} sub={tr('sixtySeconds')}>
      <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--aura-peach-soft) 0%, var(--aura-peach-wash) 70%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "aura-breath 4s ease-in-out infinite",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "var(--aura-paper)",
              boxShadow: "var(--aura-shadow)",
            }}
          />
        </div>
        <div className="title" style={{ fontSize: 24, textAlign: "center", lineHeight: 1.3 }}>
          {data.prompt || tr('breatheInOut')}
        </div>
        <div style={{ fontSize: 14, color: "var(--aura-ink-soft)", textAlign: "center", maxWidth: "40ch" }}>
          {data.body || tr('standUp')}
        </div>
        <div style={{ fontFamily: "JetBrains Mono", fontSize: 14, color: "var(--aura-ink-mute)" }}>{fmt(t)}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
        <button className="btn btn--ghost" onClick={ctx.onNext}>{tr('skipBreak')}</button>
        {t === 0 && <button className="btn btn--sage" onClick={ctx.onNext}>{tr('imBack')}</button>}
      </div>
    </CardChrome>
  );
}
