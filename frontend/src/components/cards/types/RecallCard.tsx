import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Data = {
  prompt: string;
  accept?: string[];
  model?: string;
};

export function RecallCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  const [val, setVal] = useState("");
  const [scored, setScored] = useState<"right" | "partial" | "skipped" | null>(null);

  const check = () => {
    const ok = data.accept?.some((a) => val.toLowerCase().includes(a.toLowerCase())) ?? false;
    setScored(ok ? "right" : "partial");
    ctx.onAnswer?.(ok);
  };

  return (
    <CardChrome tone="amber" label={t('recall')} sub={t('fromMemory')}>
      <h2 className="title" style={{ fontSize: 24, margin: 0, lineHeight: 1.3 }}>{data.prompt}</h2>
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        rows={3}
        placeholder={t('inYourOwnWords')}
        style={{
          width: "100%",
          padding: "14px 18px",
          borderRadius: 14,
          border: "1.5px solid var(--aura-line)",
          background: "var(--aura-paper-2)",
          font: "inherit",
          color: "inherit",
          resize: "vertical",
          outline: "none",
          lineHeight: 1.6,
          letterSpacing: "inherit",
        }}
      />
      {scored && scored !== "skipped" && (
        <div
          className="rise"
          style={{
            background: scored === "right" ? "var(--aura-sage-wash)" : "var(--aura-amber-wash)",
            padding: "14px 18px",
            borderRadius: 12,
            fontSize: 14,
            color: "var(--aura-ink-soft)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--aura-ink)" }}>
            {scored === "right" ? t('recallCorrect') : t('recallPartial')}
          </strong>
          {data.model && <div style={{ marginTop: 6 }}>{data.model}</div>}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {!scored && (
          <button className="btn btn--ghost" onClick={() => { setScored("skipped"); ctx.onAnswer?.(false); }}>
            {t('iDontRemember')}
          </button>
        )}
        {!scored && (
          <button className="btn btn--sage" onClick={check} disabled={!val.trim()}>
            {t('common:check')}
          </button>
        )}
        {scored && (
          <button className="btn btn--sage" onClick={ctx.onNext}>
            {t('common:next')}
          </button>
        )}
      </div>
    </CardChrome>
  );
}
