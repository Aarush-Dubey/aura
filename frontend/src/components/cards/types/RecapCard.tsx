import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Data = {
  title: string;
  bullets: string[];
  tags?: string[];
};

export function RecapCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  return (
    <CardChrome tone="sage" label="Recap">
      <h2 className="title" style={{ fontSize: 26, margin: 0, lineHeight: 1.15 }}>
        {data.title || "Quick recap"}
      </h2>
      <ul
        style={{
          margin: 0,
          paddingLeft: 20,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {data.bullets.map((bullet, i) => (
          <li
            key={i}
            style={{
              fontSize: 15,
              lineHeight: 1.65,
              color: "var(--aura-ink-soft)",
            }}
          >
            {bullet}
          </li>
        ))}
      </ul>
      {data.tags && data.tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {data.tags.map((t) => (
            <span key={t} className="chip" data-tone="sage" style={{ fontSize: 10 }}>
              <span className="dot" /> {t}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 8 }}>
        <button className="btn btn--ghost" onClick={ctx.onEnd}>
          End session
        </button>
        <button
          className="btn btn--sage"
          onClick={() => (ctx.onLoadNextNode ? ctx.onLoadNextNode() : ctx.onNext())}
        >
          Keep going
        </button>
      </div>
    </CardChrome>
  );
}
