import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import { Reading } from "../../text/BionicText";
import type { CardCtx } from "../CardRegistry";

type Data = {
  word: string;
  phonetic: string;
  syllables: string[];
  meaning: string;
  example: string;
};

export function VocabCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  return (
    <CardChrome tone="amber" label={t('newWord')}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div className="title" style={{ fontSize: 36 }}>{data.word}</div>
        <div style={{ fontFamily: "JetBrains Mono", fontSize: 15, color: "var(--aura-ink-mute)" }}>
          / {data.phonetic} /
        </div>
        <button className="btn btn--ghost" style={{ padding: "6px 12px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 9v6h4l5 5V4L9 9H5z" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {t('hearIt')}
          </span>
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, fontFamily: "JetBrains Mono", fontSize: 13, color: "var(--aura-sage-deep)" }}>
        {data.syllables.map((s, i) => (
          <span key={i} style={{ padding: "4px 10px", background: "var(--aura-sage-wash)", borderRadius: 6 }}>
            {s}
          </span>
        ))}
      </div>
      <Reading bionic={ctx.bionic}>
        <p style={{ fontSize: 16 }}>{data.meaning}</p>
        <p style={{ fontStyle: "italic", color: "var(--aura-ink-soft)", fontSize: 14 }}>"{data.example}"</p>
      </Reading>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn--sage" onClick={ctx.onNext}>{t('vocabAddToMyWords')}</button>
      </div>
    </CardChrome>
  );
}
