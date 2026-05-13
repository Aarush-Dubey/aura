import { CardChrome } from "../CardChrome";
import { Reading, SpeakIndicator } from "../../text/BionicText";
import type { CardCtx } from "../CardRegistry";

type Data = {
  title: string;
  timeRead?: string;
  body: string[];
  keyTerm?: { word: string; phonetic: string; meaning: string };
};

export function ConceptCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  return (
    <CardChrome tone="sage" label="Concept" sub={data.timeRead}>
      <h2 className="title" style={{ fontSize: 32, margin: 0, lineHeight: 1.15 }}>
        {data.title}
      </h2>
      <Reading bionic={ctx.bionic}>
        {data.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </Reading>
      {data.keyTerm && (
        <div
          style={{
            background: "var(--aura-sage-wash)",
            padding: "14px 18px",
            borderRadius: 12,
            display: "flex",
            gap: 14,
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              color: "var(--aura-sage-deep)",
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            key term
          </div>
          <div style={{ fontWeight: 600 }}>{data.keyTerm.word}</div>
          <div style={{ color: "var(--aura-ink-mute)", fontSize: 13 }}>
            / {data.keyTerm.phonetic} /
          </div>
          <div style={{ flex: 1, fontSize: 14, color: "var(--aura-ink-soft)" }}>
            {data.keyTerm.meaning}
          </div>
        </div>
      )}
      <SpeakIndicator on={ctx.readAloud} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button className="btn btn--ghost" onClick={ctx.onSlower}>
          Slower, please
        </button>
        <button className="btn btn--sage" onClick={ctx.onNext}>
          Got it →
        </button>
      </div>
    </CardChrome>
  );
}
