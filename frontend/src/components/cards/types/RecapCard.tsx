import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Data = {
  title: string;
  bullets: string[];
  tags?: string[];
};

export function RecapCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  return (
    <CardChrome tone="sage" label={t('recap')}>
      <h2 className="title" style={{ fontSize: 26, margin: 0, lineHeight: 1.15 }}>
        {data.title || t('recap')}
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
          {data.tags.map((tag) => (
            <span key={tag} className="chip" data-tone="sage" style={{ fontSize: 10 }}>
              <span className="dot" /> {tag}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 8 }}>
        <button className="btn btn--ghost" onClick={ctx.onEnd}>
          {t('common:endSession')}
        </button>
        <button
          className="btn btn--sage"
          onClick={() => (ctx.onLoadNextNode ? ctx.onLoadNextNode() : ctx.onNext())}
        >
          {t('common:keepGoing')}
        </button>
      </div>
    </CardChrome>
  );
}
