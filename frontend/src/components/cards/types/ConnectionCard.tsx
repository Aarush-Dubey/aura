import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import { Reading } from "../../text/BionicText";
import type { CardCtx } from "../CardRegistry";

type Data = {
  previous: string;
  current: string;
  bridge: string;
};

export function ConnectionCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  return (
    <CardChrome tone="amber" label={t('connection')} sub={t('connectionSub')}>
      <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
        <div
          style={{
            flex: "0 0 8px",
            background: "linear-gradient(to bottom, var(--aura-amber), var(--aura-sage))",
            borderRadius: 4,
          }}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--aura-ink-mute)", marginBottom: 4 }}>
              {t('connectionLastLesson')}
            </div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{data.previous}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--aura-sage-deep)", marginBottom: 4 }}>
              {t('connectionNow')}
            </div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{data.current}</div>
          </div>
          <Reading bionic={ctx.bionic}>
            <p>{data.bridge}</p>
          </Reading>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn--sage" onClick={ctx.onNext}>{t('gotItReflect')}</button>
      </div>
    </CardChrome>
  );
}
