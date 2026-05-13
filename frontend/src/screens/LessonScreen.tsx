import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAuraStore } from "../store/useAuraStore";
import { AuraCard, resolveCard, type CardCtx } from "../components/cards/CardRegistry";
import { useTTS } from "../hooks/useTTS";
import { api } from "../api/client";

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
  const cards = useAuraStore((s) => s.session.cards);
  const cursor = useAuraStore((s) => s.session.cardCursor);
  const sessionId = useAuraStore((s) => s.session.sessionId);
  const lessonPath = useAuraStore((s) => s.session.lessonPath);
  const graph = useAuraStore((s) => s.session.graph);
  const advanceCard = useAuraStore((s) => s.advanceCard);
  const previousCard = useAuraStore((s) => s.previousCard);
  const setSession = useAuraStore((s) => s.setSession);
  const navigate = useAuraStore((s) => s.navigate);
  const openChat = useAuraStore((s) => s.openChat);
  const { speak, stop, speaking } = useTTS();
  const bionicReading = useAuraStore((s) => s.settings.bionicReading);
  const readAloud = useAuraStore((s) => s.settings.readAloud);
  const focusMode = useAuraStore((s) => s.settings.focusMode);
  const [loadingNext, setLoadingNext] = useState(false);
  const card = cards[cursor];

  const currentIndex = lessonPath?.currentIndex ?? 0;
  const totalNodes = lessonPath?.items.length ?? 1;
  const currentNodeName = graph?.nodes.find(
    (n) => n.id === lessonPath?.items[currentIndex]?.nodeId
  )?.topicName;

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
                ? { ...n, status: "mastered", mastery: Math.min(1, n.mastery + 0.45) }
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

  const handleNext = useCallback(() => {
    if (cursor >= cards.length - 1) {
      loadNextNode();
    } else {
      advanceCard();
    }
  }, [cursor, cards.length, advanceCard, loadNextNode]);

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
        <h2 className="title" style={{ fontSize: 28 }}>No lesson loaded</h2>
        <p style={{ color: "var(--aura-ink-soft)" }}>Start from the dashboard to generate a lesson.</p>
        <button className="btn btn--sage" onClick={() => navigate("dashboard")}>
          Go to dashboard
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
    onAnswer: (_correct) => {},
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
              lesson {currentIndex + 1} / {totalNodes}
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
              card {cursor + 1} / {cards.length}
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
      </div>

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
            <span style={{ fontSize: 14, color: "var(--aura-ink-soft)" }}>Loading next lesson...</span>
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
              <AuraCard card={resolveCard(card)} ctx={ctx} />
            ) : (
              <div className="card card-pad-lg" style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "var(--aura-ink-soft)" }}>End of cards</p>
                <button className="btn btn--sage" onClick={() => navigate("insights")} style={{ marginTop: 12 }}>
                  View insights
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
        Ask Aura
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
          &#8592; Back
        </motion.button>
        <motion.button
          className="btn btn--ghost"
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate("insights")}
          style={{ padding: "8px 14px", fontSize: 12 }}
        >
          End lesson
        </motion.button>
      </div>
    </div>
  );
}
