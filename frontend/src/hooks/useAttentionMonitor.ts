import { useEffect, useRef, useCallback } from "react";
import { useAuraStore } from "../store/useAuraStore";
import type { LessonCard } from "../api/types";

const BLUR_THRESHOLD = 3;
const TIME_THRESHOLD_SEC = 90;

export function useAttentionMonitor() {
  const screen = useAuraStore((s) => s.screen);
  const learnerMode = useAuraStore((s) => s.settings.learnerMode);
  const injectCard = useAuraStore((s) => s.injectCard);
  const cardCursor = useAuraStore((s) => s.session.cardCursor);

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

  const handleBlur = useCallback(() => {
    if (!shouldMonitor) return;
    blurCount.current++;
    if (blurCount.current >= BLUR_THRESHOLD && !injectedBreak.current) {
      injectedBreak.current = true;
      blurCount.current = 0;
      const breakCard: LessonCard = {
        id: `break-${Date.now()}`,
        type: "text_explain" as const,
        nodeId: "attention",
        title: "Let's take a quick break",
        body: "Aura noticed you switched away a few times. That's totally normal. Stand up, stretch, look away from the screen for 60 seconds. We'll pick up right where you left off.",
      };
      injectCard(breakCard);
    }
  }, [shouldMonitor, injectCard]);

  useEffect(() => {
    if (!shouldMonitor) return;
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [shouldMonitor, handleBlur]);

  useEffect(() => {
    if (!shouldMonitor) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - cardStartTime.current) / 1000;
      if (elapsed >= TIME_THRESHOLD_SEC && !injectedReflect.current) {
        injectedReflect.current = true;
        const reflectCard: LessonCard = {
          id: `reflect-${Date.now()}`,
          type: "text_explain" as const,
          nodeId: "attention",
          title: "Quick check-in",
          body: "You've been on this card for a while. Is it making sense, or would you like Aura to explain it differently? Press 'Got it' to keep going, or use the Ask button to chat.",
        };
        injectCard(reflectCard);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [shouldMonitor, injectCard]);
}
