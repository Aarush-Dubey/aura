import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { useAuraStore } from "../store/useAuraStore";
import { api } from "../api/client";
import type { ReviewItem, ReviewStats } from "../api/types";

type Phase = "loading" | "front" | "back" | "done";

export function ReviewScreen() {
  const { t } = useTranslation("lesson");
  const navigate = useAuraStore((s) => s.navigate);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    api.reviewsDue().then(({ reviews: r, stats: s }) => {
      setReviews(r);
      setStats(s);
      setPhase(r.length > 0 ? "front" : "done");
    }).catch(() => setPhase("done"));
  }, []);

  const current = reviews[cursor];

  const rate = useCallback(async (rating: 1 | 2 | 3 | 4) => {
    if (!current) return;
    try {
      const result = await api.reviewAnswer(current.id, rating);
      setStats(result.stats);
    } catch {}
    if (cursor + 1 < reviews.length) {
      setCursor(c => c + 1);
      setPhase("front");
    } else {
      setPhase("done");
    }
  }, [current, cursor, reviews.length]);

  if (phase === "loading") {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--aura-bg)" }}>
        <span style={{ color: "var(--aura-ink-soft)" }}>{t('loadingNextLesson', 'Loading...')}</span>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--aura-bg)", gap: 16 }}>
        <h2 className="title" style={{ fontSize: 28 }}>
          {reviews.length === 0 ? "No reviews due" : "Review complete"}
        </h2>
        {stats && (
          <div style={{ display: "flex", gap: 16, fontSize: 14, color: "var(--aura-ink-soft)" }}>
            <span>{stats.total} total</span>
            <span>{stats.due} due</span>
            <span>{stats.learning} learning</span>
          </div>
        )}
        <button className="btn btn--sage" onClick={() => navigate("dashboard")}>
          {t('common:goToDashboard', 'Dashboard')}
        </button>
      </div>
    );
  }

  const progress = reviews.length > 1 ? (cursor / reviews.length) * 100 : 0;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--aura-bg)" }}>
      <div style={{ padding: "18px 32px", display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 11, color: "var(--aura-ink-mute)", fontFamily: "JetBrains Mono", letterSpacing: ".06em" }}>
          Review {cursor + 1} / {reviews.length}
        </span>
        <div style={{ flex: 1, height: 3, borderRadius: 999, background: "var(--aura-line-soft)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "var(--aura-sage)", borderRadius: 999, transition: "width .5s" }} />
        </div>
        {stats && (
          <span style={{ fontSize: 11, color: "var(--aura-ink-mute)", fontFamily: "JetBrains Mono" }}>
            {stats.due} due
          </span>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 32px 40px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={current?.id ?? cursor}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{ width: "100%", maxWidth: 640 }}
          >
            <div className="card card-pad-lg" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="chip" data-tone="amber">
                  <span className="dot" />
                  {current?.state === "new" ? "New" : "Review"}
                </span>
                {current && (
                  <span style={{ fontSize: 11, color: "var(--aura-ink-mute)", fontFamily: "JetBrains Mono" }}>
                    {current.reps} reps
                  </span>
                )}
              </div>

              <h2 className="title" style={{ fontSize: 24, margin: 0, lineHeight: 1.4 }}>
                {current?.front}
              </h2>

              {phase === "front" && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button className="btn btn--sage" onClick={() => setPhase("back")}>
                    Show Answer
                  </button>
                </div>
              )}

              {phase === "back" && (
                <>
                  <div style={{ borderTop: "1px solid var(--aura-line)", paddingTop: 16 }}>
                    <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--aura-ink)" }}>
                      {current?.back}
                    </p>
                  </div>

                  <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                    {([
                      { rating: 1, label: "Again", color: "var(--aura-clay)" },
                      { rating: 2, label: "Hard", color: "var(--aura-amber)" },
                      { rating: 3, label: "Good", color: "var(--aura-sage)" },
                      { rating: 4, label: "Easy", color: "var(--aura-sky, var(--aura-sage-deep))" },
                    ] as const).map(({ rating, label, color }) => (
                      <button
                        key={rating}
                        onClick={() => rate(rating)}
                        style={{
                          padding: "10px 20px",
                          borderRadius: 10,
                          border: `1.5px solid ${color}`,
                          background: "var(--aura-paper)",
                          cursor: "pointer",
                          font: "inherit",
                          fontSize: 14,
                          fontWeight: 500,
                          color,
                          transition: "all .15s",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div style={{ padding: "12px 32px 20px", display: "flex", justifyContent: "flex-start" }}>
        <button className="btn btn--ghost" onClick={() => navigate("dashboard")} style={{ padding: "8px 16px", fontSize: 13 }}>
          &#8592; {t('common:back', 'Back')}
        </button>
      </div>
    </div>
  );
}
