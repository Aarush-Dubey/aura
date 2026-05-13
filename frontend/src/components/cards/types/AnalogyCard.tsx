import type { ReactNode } from "react";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Data = {
  title: string;
  familiar: { name: string; desc: string };
  target: { name: string; desc: string };
  mapping: string;
};

function Side({ label, tone, children }: { label: string; tone: "peach" | "sage"; children: ReactNode }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 14,
        background: tone === "peach" ? "var(--aura-peach-wash)" : "var(--aura-sage-wash)",
        border: "1px solid var(--aura-line-soft)",
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--aura-ink-mute)", marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export function AnalogyCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  return (
    <CardChrome tone="peach" label="Analogy" sub="bridging from what you know">
      <h2 className="title" style={{ fontSize: 28, margin: 0 }}>{data.title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 1fr", gap: 18, alignItems: "stretch" }}>
        <Side label="Familiar" tone="peach">
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>{data.familiar.name}</div>
          <div style={{ fontSize: 13, color: "var(--aura-ink-soft)", lineHeight: 1.5 }}>{data.familiar.desc}</div>
        </Side>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="50" height="22" viewBox="0 0 50 22">
            <path d="M2 11 L42 11 M34 4 L42 11 L34 18" stroke="var(--aura-ink-mute)" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
        <Side label="New" tone="sage">
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>{data.target.name}</div>
          <div style={{ fontSize: 13, color: "var(--aura-ink-soft)", lineHeight: 1.5 }}>{data.target.desc}</div>
        </Side>
      </div>
      <div
        style={{
          background: "var(--aura-paper-2)",
          padding: "14px 18px",
          borderRadius: 12,
          fontSize: 14,
          color: "var(--aura-ink-soft)",
          lineHeight: 1.6,
          borderLeft: "3px solid var(--aura-peach)",
        }}
      >
        <strong style={{ color: "var(--aura-ink)" }}>Mapping →</strong> {data.mapping}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="btn btn--sage" onClick={ctx.onNext}>This clicks</button>
      </div>
    </CardChrome>
  );
}
