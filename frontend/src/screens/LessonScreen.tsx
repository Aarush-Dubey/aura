import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useAuraStore } from "../store/useAuraStore";
import { AuraCard, resolveCard, type CardCtx } from "../components/cards/CardRegistry";
import { useTTS } from "../hooks/useTTS";
import { api } from "../api/client";
import { FocusTimer } from "../components/lesson/FocusTimer";
import type { LessonCard } from "../api/types";

function extractCardText(resolved: { type: string; data: any }): string {
  const d = resolved.data;
  const parts: string[] = [];
  if (d.title) parts.push(d.title);
  if (Array.isArray(d.body)) parts.push(...d.body);
  else if (typeof d.body === "string") parts.push(d.body);
  if (d.question) parts.push(d.question);
  if (d.prompt) parts.push(d.prompt);
  if (d.bridge) parts.push(d.bridge);
  if (d.correction) parts.push(d.correction);
  if (d.meaning) parts.push(d.meaning);
  return parts.join(". ");
}

export function LessonScreen() {
  const { t } = useTranslation("lesson");
  const cards = useAuraStore((s) => s.session.cards);
  const cursor = useAuraStore((s) => s.session.cardCursor);
  const sessionId = useAuraStore((s) => s.session.sessionId);
  const lessonPath = useAuraStore((s) => s.session.lessonPath);
  const graph = useAuraStore((s) => s.session.graph);
  const openingMessage = useAuraStore((s) => s.session.openingMessage);
  const advanceCard = useAuraStore((s) => s.advanceCard);
  const previousCard = useAuraStore((s) => s.previousCard);
  const setSession = useAuraStore((s) => s.setSession);
  const navigate = useAuraStore((s) => s.navigate);
  const openChat = useAuraStore((s) => s.openChat);
  const injectCard = useAuraStore((s) => s.injectCard);
  const trackEffort = useAuraStore((s) => s.trackEffort);
  const { speak, stop, speaking } = useTTS();
  const bionicReading = useAuraStore((s) => s.settings.bionicReading);
  const readAloud = useAuraStore((s) => s.settings.readAloud);
  const focusMode = useAuraStore((s) => s.settings.focusMode);
  const [loadingNext, setLoadingNext] = useState(false);
  const [effortToast, setEffortToast] = useState<string | null>(null);
  const card = cards[cursor];
  const cardStartedAt = useRef(Date.now());
  const wrongStreak = useRef(0);
  const fastCorrectStreak = useRef(0);
  const injectedNudgeForCard = useRef<string | null>(null);

  const currentIndex = lessonPath?.currentIndex ?? 0;
  const totalNodes = lessonPath?.items.length ?? 1;
  const currentNodeName = graph?.nodes.find(
    (n) => n.id === lessonPath?.items[currentIndex]?.nodeId
  )?.topicName;
  const currentNodeId = lessonPath?.items[currentIndex]?.nodeId ?? card?.nodeId;

  useEffect(() => {
    cardStartedAt.current = Date.now();
    injectedNudgeForCard.current = null;
    if (card) {
      trackEffort({ type: "card_started", cardId: card.id, nodeId: card.nodeId, label: card.type });
    }
  }, [card?.id, card, trackEffort]);

  useEffect(() => {
    if (!effortToast) return;
    const id = window.setTimeout(() => setEffortToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [effortToast]);

  function injectAdaptiveCard(kind: "stuck" | "too_easy") {
    if (!card || injectedNudgeForCard.current === `${card.id}:${kind}`) return;
    const nextType = cards[cursor + 1]?.type;
    if (cursor < 3 || card.type === "reflect" || card.type === "break" || nextType === "reflect" || nextType === "break") return;
    injectedNudgeForCard.current = `${card.id}:${kind}`;
    const nudge: LessonCard = kind === "stuck" ? {
      id: `adaptive-stuck-${Date.now()}`,
      type: "reflect",
      nodeId: currentNodeId ?? "attention",
      reason: "stuck",
      prompt: t("cards:stuckNudgePrompt"),
    } : {
      id: `adaptive-easy-${Date.now()}`,
      type: "reflect",
      nodeId: currentNodeId ?? "attention",
      reason: "manual",
      prompt: t("cards:tooEasyNudgePrompt"),
    };
    injectCard(nudge);
    trackEffort({ type: "adaptive_nudge", cardId: card.id, nodeId: currentNodeId, label: kind });
  }

  const loadNextNode = useCallback(async () => {
    if (!sessionId || loadingNext) return;
    setLoadingNext(true);
    const completedNodeId = lessonPath?.items[lessonPath.currentIndex]?.nodeId;
    try {
      const result = await api.respond(sessionId, "completed");
      const patchedGraph = graph && completedNodeId
        ? {
            ...graph,
            nodes: graph.nodes.map((n) =>
              n.id === completedNodeId
                ? { ...n, status: "mastered", mastery: Math.max(0.8, n.mastery) }
                : n
            ),
          }
        : graph;
      const isLastNode = lessonPath ? lessonPath.currentIndex >= lessonPath.items.length - 1 : false;
      const advanced = result.transitionAction?.type === "ADVANCE" && lessonPath && !isLastNode;
      const patch: Parameters<typeof setSession>[0] = {
        cards: result.cards,
        cardCursor: 0,
        mapState: result.mapState,
        gameState: result.gameStatePatch,
      };
      if (patchedGraph) patch.graph = patchedGraph;
      if (advanced && lessonPath) {
        patch.lessonPath = { ...lessonPath, currentIndex: lessonPath.currentIndex + 1 };
      }
      setSession(patch);
    } catch (err) {
      console.warn("loadNextNode failed", err);
    } finally {
      setLoadingNext(false);
    }
  }, [sessionId, loadingNext, lessonPath, graph, setSession]);

  const reportCardEvent = useCallback((eventType: "card_completed" | "answer_submitted", payload: Record<string, unknown>) => {
    if (!sessionId || !card) return;
    const elapsedMs = Date.now() - cardStartedAt.current;
    void api.cardEvent({
      sessionId,
      cardId: card.id,
      nodeId: card.nodeId,
      eventType,
      payload: { ...payload, cardType: card.type },
      telemetry: { responseTimeMs: elapsedMs, hintUsed: false, attemptNumber: 1 },
    }).then((patch) => {
      const nextPatch: Parameters<typeof setSession>[0] = {};
      if (patch.mapState) nextPatch.mapState = patch.mapState;
      if (patch.gameStatePatch) nextPatch.gameState = patch.gameStatePatch;
      if (patch.nodeState && graph) {
        nextPatch.graph = {
          ...graph,
          nodes: graph.nodes.map((n) => n.id === patch.nodeState?.nodeId ? { ...n, status: patch.nodeState.status, mastery: patch.nodeState.mastery } : n),
        };
      }
      if (Object.keys(nextPatch).length) setSession(nextPatch);
    }).catch(() => {});
  }, [sessionId, card, graph, setSession]);

  const handleNext = useCallback(() => {
    if (card) {
      const elapsedMs = Date.now() - cardStartedAt.current;
      trackEffort({
        type: "card_completed",
        cardId: card.id,
        nodeId: card.nodeId,
        elapsedMs,
        label: card.type,
      });
      reportCardEvent("card_completed", { elapsedMs });
    }
    if (cursor >= cards.length - 1) {
      loadNextNode();
    } else {
      advanceCard();
    }
  }, [card, cursor, cards.length, advanceCard, loadNextNode, reportCardEvent, trackEffort]);

  if (!cards.length) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--aura-bg)",
          gap: 16,
        }}
      >
        <h2 className="title" style={{ fontSize: 28 }}>{t('noLessonLoaded')}</h2>
        <p style={{ color: "var(--aura-ink-soft)" }}>{t('startFromDashboard')}</p>
        <button className="btn btn--sage" onClick={() => navigate("dashboard")}>
          {t('common:goToDashboard')}
        </button>
      </div>
    );
  }

  const cardProgress = cards.length > 1 ? (cursor / (cards.length - 1)) * 100 : 100;

  const handleHearIt = () => {
    if (speaking) {
      stop();
    } else if (card) {
      const resolved = resolveCard(card);
      const text = extractCardText(resolved);
      if (text) speak(text);
    }
  };

  const ctx: CardCtx = {
    bionic: bionicReading,
    readAloud,
    onNext: handleNext,
    onAnswer: (correct) => {
      const elapsedMs = Date.now() - cardStartedAt.current;
      trackEffort({
        type: "answer_submitted",
        cardId: card?.id,
        nodeId: currentNodeId,
        elapsedMs,
        correct,
        label: card?.type,
      });
      reportCardEvent("answer_submitted", { correct, elapsedMs });
      if (correct) {
        wrongStreak.current = 0;
        fastCorrectStreak.current = elapsedMs < 12_000 ? fastCorrectStreak.current + 1 : 0;
        if (fastCorrectStreak.current >= 2) {
          setEffortToast(t("cards:tooEasyToast"));
          injectAdaptiveCard("too_easy");
          fastCorrectStreak.current = 0;
        } else {
          setEffortToast(t("cards:correctToast"));
        }
      } else {
        wrongStreak.current += 1;
        fastCorrectStreak.current = 0;
        setEffortToast(wrongStreak.current >= 2 ? t("cards:stuckToast") : t("cards:tryAgainToast"));
        if (wrongStreak.current >= 2) {
          injectAdaptiveCard("stuck");
          wrongStreak.current = 0;
        }
      }
    },
    onSlower: () => {},
    onEnd: () => navigate("workspace_overview"),
    onLoadNextNode: loadNextNode,
    onHearIt: handleHearIt,
    hearing: speaking,
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--aura-bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Progress header */}
      <div
        style={{
          flex: "0 0 auto",
          padding: "18px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          opacity: focusMode ? 0.35 : 1,
          transition: "opacity .3s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, maxWidth: 600 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span
              style={{
                fontSize: 11,
                color: "var(--aura-ink-mute)",
                fontFamily: "JetBrains Mono",
                whiteSpace: "nowrap",
                letterSpacing: ".06em",
              }}
            >
              {t('lessonProgress', { current: currentIndex + 1, total: totalNodes })}
              {currentNodeName && (
                <span style={{ marginLeft: 8, color: "var(--aura-ink-soft)", fontFamily: "inherit" }}>
                  {currentNodeName}
                </span>
              )}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--aura-ink-mute)",
                fontFamily: "JetBrains Mono",
                whiteSpace: "nowrap",
              }}
            >
              {t('cardProgress', { current: cursor + 1, total: cards.length })}
            </span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Node-level progress */}
            <div style={{ height: 3, borderRadius: 999, background: "var(--aura-line-soft)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${totalNodes > 1 ? (currentIndex / (totalNodes - 1)) * 100 : 100}%`,
                  background: "var(--aura-sage)",
                  borderRadius: 999,
                  transition: "width .5s",
                }}
              />
            </div>
            {/* Card-level progress */}
            <div style={{ height: 3, borderRadius: 999, background: "var(--aura-line-soft)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${cardProgress}%`,
                  background: "linear-gradient(to right, var(--aura-sage), var(--aura-peach))",
                  borderRadius: 999,
                  transition: "width .5s",
                }}
              />
            </div>
          </div>
        </div>
        <FocusTimer />
      </div>

      {effortToast && (
        <div
          style={{
            position: "absolute",
            top: 78,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 8,
            padding: "9px 14px",
            borderRadius: 999,
            border: "1px solid var(--aura-line)",
            background: "var(--aura-paper)",
            color: "var(--aura-ink-soft)",
            boxShadow: "var(--aura-shadow)",
            fontSize: 13,
          }}
        >
          {effortToast}
        </div>
      )}

      {/* Loading overlay for node transition */}
      {loadingNext && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderRadius: 16, background: "var(--aura-paper)", boxShadow: "var(--aura-shadow)" }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, var(--aura-peach), var(--aura-sage))",
                animation: "aura-breath 1.6s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: 14, color: "var(--aura-ink-soft)" }}>{t('loadingNextLesson')}</span>
          </div>
        </div>
      )}

      {/* Card stage */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px 32px 40px",
          position: "relative",
          minHeight: 0,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={card?.id ?? cursor}
            initial={{ opacity: 0, x: 100, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -100, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{ width: "100%", maxWidth: 720 }}
          >
            {card ? (
              <>
                {cursor === 0 && openingMessage && (
                  <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 14, background: "var(--aura-sage-wash)", color: "var(--aura-sage-deep)", fontSize: 14 }}>
                    {openingMessage}
                  </div>
                )}
                <AuraCard card={resolveCard(card)} ctx={ctx} />
              </>
            ) : (
              <div className="card card-pad-lg" style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "var(--aura-ink-soft)" }}>{t('common:endOfCards')}</p>
                <button className="btn btn--sage" onClick={() => navigate("insights")} style={{ marginTop: 12 }}>
                  {t('common:viewInsights')}
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Floating "Ask Aura" button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => openChat("keyboard")}
        style={{
          position: "absolute",
          bottom: 24,
          right: 32,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 22px",
          borderRadius: 999,
          border: "none",
          background: "linear-gradient(135deg, var(--aura-sage), var(--aura-sage-deep, #4a7c59))",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(107,158,126,.35), 0 1px 3px rgba(0,0,0,.1)",
          letterSpacing: ".02em",
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>&#x2728;</span>
        {t('askAura')}
      </motion.button>

      {/* Bottom nav */}
      <div
        style={{
          flex: "0 0 auto",
          padding: "12px 32px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <motion.button
          className="btn btn--ghost"
          onClick={previousCard}
          disabled={cursor === 0}
          whileTap={{ scale: 0.95 }}
          style={{ padding: "8px 16px", fontSize: 13 }}
        >
          &#8592; {t('common:back')}
        </motion.button>
        <motion.button
          className="btn btn--ghost"
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate("insights")}
          style={{ padding: "8px 14px", fontSize: 12 }}
        >
          {t('common:endLesson')}
        </motion.button>
      </div>
    </div>
  );
}
