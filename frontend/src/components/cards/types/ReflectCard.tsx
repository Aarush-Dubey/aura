import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Data = {
  prompt?: string;
};

const OPTION_KEYS = [
  { k: "lost", emoji: "\u{1F32B}\u{FE0F}", tKey: "lost" },
  { k: "fuzzy", emoji: "\u{1F324}\u{FE0F}", tKey: "fuzzy" },
  { k: "good", emoji: "\u{2600}\u{FE0F}", tKey: "gotItReflect" },
  { k: "easy", emoji: "\u{26A1}", tKey: "tooEasy" },
] as const;

export function ReflectCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  const [pick, setPick] = useState<string | null>(null);

  return (
    <CardChrome tone="sky" label={t('quickCheckIn')} sub={t('howWasThat')}>
      <div className="title" style={{ fontSize: 22, lineHeight: 1.3 }}>
        {data.prompt || t('whatClicked')}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        {OPTION_KEYS.map((o) => (
          <button
            key={o.k}
            onClick={() => {
              setPick(o.k);
              ctx.onAnswer?.(o.k === "good" || o.k === "easy");
            }}
            style={{
              padding: "18px 10px",
              borderRadius: 14,
              font: "inherit",
              color: "inherit",
              background: pick === o.k ? "var(--aura-sage-wash)" : "var(--aura-paper-2)",
              border: "1.5px solid " + (pick === o.k ? "var(--aura-sage)" : "var(--aura-line)"),
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              transition: "all .2s",
            }}
          >
            <span style={{ fontSize: 24 }}>{o.emoji}</span>
            <span style={{ fontSize: 13 }}>{t(o.tKey)}</span>
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        placeholder={t('anythingToTell')}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 12,
          border: "1.5px solid var(--aura-line)",
          background: "var(--aura-paper-2)",
          font: "inherit",
          color: "inherit",
          resize: "none",
          outline: "none",
          letterSpacing: "inherit",
        }}
      />
      {pick && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn--sage" onClick={ctx.onNext}>{t('common:continue')}</button>
        </div>
      )}
    </CardChrome>
  );
}
