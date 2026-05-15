import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuraStore } from "../../store/useAuraStore";
import type { LessonCard } from "../../api/types";

function fmt(total: number) {
  const safe = Math.max(0, total);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function FocusTimer() {
  const { t } = useTranslation("lesson");
  const minutes = useAuraStore((s) => s.settings.focusBlockMinutes);
  const proactiveBreaks = useAuraStore((s) => s.settings.proactiveBreaks);
  const injectCard = useAuraStore((s) => s.injectCard);
  const trackEffort = useAuraStore((s) => s.trackEffort);
  const screen = useAuraStore((s) => s.screen);
  const sessionId = useAuraStore((s) => s.session.sessionId);
  const cardCursor = useAuraStore((s) => s.session.cardCursor);
  const cards = useAuraStore((s) => s.session.cards);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const offeredRef = useRef(false);

  const totalSeconds = minutes * 60;
  const elapsedSeconds = Math.floor((now - startedAt) / 1000);
  const remaining = totalSeconds - elapsedSeconds;
  const pct = useMemo(() => Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100)), [elapsedSeconds, totalSeconds]);

  useEffect(() => {
    if (screen !== "lesson" || !sessionId) return;
    setStartedAt(Date.now());
    setNow(Date.now());
    offeredRef.current = false;
    trackEffort({ type: "focus_block_started", label: `${minutes} min block` });
  }, [minutes, screen, sessionId, trackEffort]);

  useEffect(() => {
    if (screen !== "lesson" || !sessionId) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [screen, sessionId]);

  useEffect(() => {
    const currentType = cards[cardCursor]?.type;
    const nextType = cards[cardCursor + 1]?.type;
    const canOffer = cardCursor >= 3 && currentType !== "break" && currentType !== "reflect" && nextType !== "break" && nextType !== "reflect";
    if (!proactiveBreaks || remaining > 0 || offeredRef.current || !canOffer) return;
    offeredRef.current = true;
    trackEffort({ type: "focus_block_completed", elapsedMs: Date.now() - startedAt, label: "Focus block complete" });
    const card: LessonCard = {
      id: `focus-break-${Date.now()}`,
      type: "break",
      nodeId: "attention",
      reason: "timer",
      prompt: t("focusBreakPrompt"),
      body: t("focusBreakBody"),
    };
    injectCard(card);
  }, [cardCursor, cards, injectCard, proactiveBreaks, remaining, startedAt, t, trackEffort]);

  function resetBlock() {
    setStartedAt(Date.now());
    setNow(Date.now());
    offeredRef.current = false;
    trackEffort({ type: "focus_block_started", label: "Focus block restarted" });
  }

  return (
    <button
      type="button"
      onClick={resetBlock}
      title={t("restartFocusBlock")}
      style={{
        minWidth: 162,
        padding: "8px 12px",
        borderRadius: 14,
        border: "1px solid var(--aura-line)",
        background: "var(--aura-paper)",
        color: "var(--aura-ink-soft)",
        font: "inherit",
        cursor: "pointer",
        display: "grid",
        gap: 5,
        textAlign: "left",
      }}
    >
      <span style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, fontFamily: "JetBrains Mono" }}>
        <span>{remaining > 0 ? t("focusBlock") : t("focusComplete")}</span>
        <b style={{ color: "var(--aura-sage-deep)" }}>{remaining > 0 ? fmt(remaining) : "0:00"}</b>
      </span>
      <span style={{ height: 4, borderRadius: 999, background: "var(--aura-line-soft)", overflow: "hidden" }}>
        <i
          style={{
            display: "block",
            height: "100%",
            width: `${pct}%`,
            borderRadius: 999,
            background: "linear-gradient(90deg, var(--aura-sage), var(--aura-peach))",
          }}
        />
      </span>
    </button>
  );
}
