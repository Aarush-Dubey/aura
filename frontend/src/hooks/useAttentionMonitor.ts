import { useEffect, useRef, useCallback } from "react";
import i18n from "../i18n/i18n";
import { useAuraStore } from "../store/useAuraStore";
import type { LessonCard } from "../api/types";

const BLUR_THRESHOLD = 3;
const TIME_THRESHOLD_SEC = 90;
const MIN_CARDS_BEFORE_NUDGE = 3;

export function useAttentionMonitor() {
  const screen = useAuraStore((s) => s.screen);
  const learnerMode = useAuraStore((s) => s.settings.learnerMode);
  const injectCard = useAuraStore((s) => s.injectCard);
  const trackEffort = useAuraStore((s) => s.trackEffort);
  const cardCursor = useAuraStore((s) => s.session.cardCursor);
  const cards = useAuraStore((s) => s.session.cards);

  const blurCount = useRef(0);
  const cardStartTime = useRef(Date.now());
  const injectedBreak = useRef(false);
  const injectedReflect = useRef(false);

  useEffect(() => {
    cardStartTime.current = Date.now();
    injectedBreak.current = false;
    injectedReflect.current = false;
  }, [cardCursor]);

  const shouldMonitor = screen === "lesson" && (learnerMode === "both" || learnerMode === "adhd");
  const currentType = cards[cardCursor]?.type;
  const nextType = cards[cardCursor + 1]?.type;
  const canInjectNudge = shouldMonitor && cardCursor >= MIN_CARDS_BEFORE_NUDGE && currentType !== "reflect" && currentType !== "break" && nextType !== "reflect" && nextType !== "break";

  const handleBlur = useCallback(() => {
    if (!canInjectNudge) return;
    blurCount.current++;
    if (blurCount.current >= BLUR_THRESHOLD && !injectedBreak.current) {
      injectedBreak.current = true;
      blurCount.current = 0;
      const breakCard: LessonCard = {
        id: `break-${Date.now()}`,
        type: "break",
        nodeId: "attention",
        reason: "blur",
        prompt: i18n.t("cards:blurBreakPrompt"),
        body: i18n.t("cards:blurBreakBody"),
      };
      injectCard(breakCard);
      trackEffort({ type: "adaptive_nudge", label: "blur break" });
    }
  }, [canInjectNudge, injectCard, trackEffort]);

  useEffect(() => {
    if (!shouldMonitor) return;
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [shouldMonitor, handleBlur]);

  useEffect(() => {
    if (!shouldMonitor) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - cardStartTime.current) / 1000;
      if (elapsed >= TIME_THRESHOLD_SEC && canInjectNudge && !injectedReflect.current) {
        injectedReflect.current = true;
        const reflectCard: LessonCard = {
          id: `reflect-${Date.now()}`,
          type: "reflect",
          nodeId: "attention",
          reason: "stuck",
          prompt: i18n.t("cards:longCardPrompt"),
        };
        injectCard(reflectCard);
        trackEffort({ type: "adaptive_nudge", elapsedMs: elapsed * 1000, label: "long card reflection" });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [shouldMonitor, canInjectNudge, injectCard, trackEffort]);
}
