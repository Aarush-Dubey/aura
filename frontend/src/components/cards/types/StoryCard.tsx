import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import { Reading, SpeakIndicator } from "../../text/BionicText";
import type { CardCtx } from "../CardRegistry";

type Data = {
  title: string;
  beats: string[];
};

export function StoryCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  return (
    <CardChrome tone="amber" label={t('story')} sub={t('storySub')}>
      <h2 className="title" style={{ fontSize: 28, margin: 0 }}>{data.title}</h2>
      <Reading bionic={ctx.bionic}>
        {data.beats.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
            <div
              style={{
                flex: "0 0 28px",
                height: 28,
                borderRadius: 999,
                background: "var(--aura-amber-wash)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "JetBrains Mono",
                fontSize: 11,
                color: "var(--aura-ink-soft)",
                marginTop: 2,
              }}
            >
              {i + 1}
            </div>
            <p style={{ margin: 0, flex: 1 }}>{b}</p>
          </div>
        ))}
      </Reading>
      <SpeakIndicator on={ctx.readAloud} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn--sage" onClick={ctx.onNext}>{t('common:continue')}</button>
      </div>
    </CardChrome>
  );
}
