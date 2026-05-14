import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import { Reading } from "../../text/BionicText";
import type { CardCtx } from "../CardRegistry";

type Data = {
  observation: string;
  title: string;
  misconception: string;
  truth: string;
  correction: string;
};

export function RepairCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  return (
    <CardChrome tone="clay" label={t('repair')} accent="var(--aura-clay)" sub={t('repairSub')}>
      <div
        style={{
          background: "var(--aura-clay-soft)",
          padding: "12px 16px",
          borderRadius: 12,
          fontSize: 13,
          color: "var(--aura-ink-soft)",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <span style={{ fontSize: 14 }}>👀</span>
        <div>
          <strong style={{ color: "var(--aura-ink)" }}>{t('repairNoticed')}</strong> {data.observation}
        </div>
      </div>
      <h2 className="title" style={{ fontSize: 24, margin: 0, lineHeight: 1.3 }}>{data.title}</h2>
      <Reading bionic={ctx.bionic}>
        <p>{data.correction}</p>
      </Reading>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 12, background: "var(--aura-clay-soft)", border: "1px solid var(--aura-clay)" }}>
          <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--aura-clay)", marginBottom: 6, fontWeight: 600 }}>{t('repairNotQuite')}</div>
          <div style={{ fontSize: 14, color: "var(--aura-ink-soft)" }}>{data.misconception}</div>
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: "var(--aura-sage-wash)", border: "1px solid var(--aura-sage)" }}>
          <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--aura-sage-deep)", marginBottom: 6, fontWeight: 600 }}>{t('repairActually')}</div>
          <div style={{ fontSize: 14, color: "var(--aura-ink-soft)" }}>{data.truth}</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn--sage" onClick={ctx.onNext}>{t('repairISeeIt')}</button>
      </div>
    </CardChrome>
  );
}
