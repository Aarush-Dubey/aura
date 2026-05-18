import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuraStore } from "../store/useAuraStore";
import { ScreenShell } from "../components/shell/ScreenShell";
import { api } from "../api/client";

type InsightsData = {
  sessionId: string;
  topic: string;
  totalNodes: number;
  masteredNodes: number;
  shakyNodes: string[];
  accuracy: number;
  timeSpent: string;
  strongAreas: string[];
  suggestion: string;
};

function Insight({ tone, title, items, emptyLabel }: { tone: string; title: string; items: string[]; emptyLabel: string }) {
  const colors: Record<string, string> = {
    sage: "var(--aura-sage)",
    clay: "var(--aura-clay)",
    peach: "var(--aura-peach)",
    sky: "var(--aura-sky)",
  };
  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: 16,
        background: "var(--aura-paper)",
        border: "1px solid var(--aura-line-soft)",
        borderLeft: `3px solid ${colors[tone] ?? "var(--aura-sage)"}`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {items.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--aura-ink-soft)", lineHeight: 1.7 }}>
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 13, color: "var(--aura-ink-mute)" }}>{emptyLabel}</div>
      )}
    </div>
  );
}

export function InsightsScreen() {
  const { t } = useTranslation("insights");
  const navigate = useAuraStore((s) => s.navigate);
  const sessionId = useAuraStore((s) => s.session.sessionId);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    api.sessionInsights(sessionId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <ScreenShell>
      <div className="rise" style={{ maxWidth: 780, display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
        <div>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--aura-ink-mute)", marginBottom: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>
            {t('sessionComplete')}
          </div>
          <h1 className="title" style={{ fontSize: 44, margin: 0, lineHeight: 1.1 }}>
            {data ? `${data.topic} — ${t('accuracy', { pct: data.accuracy })}` : t('sessionInsights')}
          </h1>
          {data && (
            <p style={{ fontSize: 15, color: "var(--aura-ink-soft)", marginTop: 10 }}>
              {t('nodesMastered', { mastered: data.masteredNodes, total: data.totalNodes, time: data.timeSpent })}
            </p>
          )}
        </div>

        {loading && <div style={{ color: "var(--aura-ink-mute)", fontSize: 13 }}>{t('loadingInsights')}</div>}

        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Insight tone="sage" title={t('whatStuck')} items={data.strongAreas} emptyLabel={t('noneRecorded')} />
            <Insight tone="peach" title={t('shakyNodes')} items={data.shakyNodes} emptyLabel={t('noneRecorded')} />
            <Insight tone="sky" title={t('suggestion')} items={[data.suggestion]} emptyLabel={t('noneRecorded')} />
          </div>
        )}

        {!loading && !data && (
          <div style={{ color: "var(--aura-ink-mute)", fontSize: 14 }}>{t('noSessionData')}</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
          <button className="btn btn--ghost" onClick={() => navigate("dashboard")}>{t('common:dashboard')}</button>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn--ghost" onClick={() => navigate("lesson")}>{t('common:replayLesson')}</button>
            <button className="btn btn--sage" onClick={() => navigate("dashboard")}>{t('common:done')} &rarr;</button>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}
