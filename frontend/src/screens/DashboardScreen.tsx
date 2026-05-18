import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useAuraStore } from "../store/useAuraStore";
import { ScreenShell } from "../components/shell/ScreenShell";
import { api } from "../api/client";
import type { ReviewStats } from "../api/types";

type SessionItem = {
  id: string;
  topic: string;
  startedAt: string;
  nodeCount: number;
  masteredCount: number;
  currentIndex: number;
  totalItems: number;
};

export function DashboardScreen() {
  const { t } = useTranslation("dashboard");
  const navigate = useAuraStore((s) => s.navigate);
  const loadLesson = useAuraStore((s) => s.loadLesson);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState<string | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);

  useEffect(() => {
    api.listSessions().then((r) => setSessions(r.sessions)).catch(() => {}).finally(() => setLoading(false));
    api.reviewStats().then(setReviewStats).catch(() => {});
  }, []);

  async function resume(id: string) {
    setResuming(id);
    try {
      const response = await api.resumeSession(id);
      loadLesson(response);
      navigate("workspace_overview");
    } catch {
      setResuming(null);
    }
  }

  return (
    <ScreenShell>
      <div className="rise" style={{ maxWidth: 800, width: "100%", display: "flex", flexDirection: "column", gap: 32 }}>
        <div>
          <div
            style={{
              fontFamily: "JetBrains Mono",
              fontSize: 11,
              color: "var(--aura-ink-mute)",
              marginBottom: 10,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            {t('label')}
          </div>
          <h1 className="title" style={{ fontSize: 44, margin: 0, lineHeight: 1.1 }}>
            {t('welcomeBack')}
          </h1>
          <p style={{ fontSize: 16, color: "var(--aura-ink-soft)", marginTop: 10, maxWidth: "52ch", lineHeight: 1.6 }}>
            {t('pickUpOrStart')}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <motion.button
            className="card card-pad"
            onClick={() => navigate("workspace_create")}
            whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(60,45,25,.1)" }}
            whileTap={{ scale: 0.97 }}
            style={{
              cursor: "pointer",
              textAlign: "left",
              border: "1.5px dashed var(--aura-line)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 24 }}>+</span>
            <span style={{ fontWeight: 600 }}>{t('newWorkspace')}</span>
            <span style={{ fontSize: 13, color: "var(--aura-ink-soft)" }}>{t('startNewTopic')}</span>
          </motion.button>

          {reviewStats && reviewStats.due > 0 && (
            <motion.button
              className="card card-pad"
              onClick={() => navigate("review")}
              whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(60,45,25,.1)" }}
              whileTap={{ scale: 0.97 }}
              style={{
                cursor: "pointer",
                textAlign: "left",
                border: "1.5px solid var(--aura-sage)",
                background: "var(--aura-sage-wash)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{t('spacedReview', 'Spaced Review')}</span>
                <span className="chip" data-tone="amber" style={{ padding: "3px 8px", fontSize: 10 }}>
                  <span className="dot" />
                  {reviewStats.due} due
                </span>
              </div>
              <span style={{ fontSize: 13, color: "var(--aura-ink-soft)" }}>
                {t('reviewDueDescription', 'Review cards are waiting. Short session, big retention boost.')}
              </span>
            </motion.button>
          )}

          {loading && (
            <div className="card card-pad" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "var(--aura-ink-mute)", fontSize: 13 }}>{t('loadingSessions')}</span>
            </div>
          )}

          {sessions.map((s) => {
            const pct = s.totalItems > 0 ? Math.round((s.currentIndex / s.totalItems) * 100) : 0;
            return (
              <motion.button
                key={s.id}
                className="card card-pad"
                onClick={() => resume(s.id)}
                disabled={resuming === s.id}
                whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(60,45,25,.1)" }}
                whileTap={{ scale: 0.97 }}
                style={{
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{s.topic}</span>
                  <span className="chip" data-tone="sage" style={{ padding: "3px 8px", fontSize: 10 }}>
                    <span className="dot" />
                    {pct}%
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: "var(--aura-line-soft)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: "linear-gradient(to right, var(--aura-sage), var(--aura-peach))",
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: "var(--aura-ink-mute)", display: "flex", gap: 12 }}>
                  <span>{s.nodeCount} {t('nodes')}</span>
                  <span>{s.masteredCount} {t('masteredCount')}</span>
                  <span>{new Date(s.startedAt).toLocaleDateString()}</span>
                </div>
                {resuming === s.id && (
                  <span style={{ fontSize: 12, color: "var(--aura-sage-deep)" }}>{t('resuming')}</span>
                )}
              </motion.button>
            );
          })}
        </div>

      </div>
    </ScreenShell>
  );
}
