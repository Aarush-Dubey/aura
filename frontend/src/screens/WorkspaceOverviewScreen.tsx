import { useState, useCallback } from "react";
import { motion } from "motion/react";
import { useAuraStore } from "../store/useAuraStore";
import { ScreenShell } from "../components/shell/ScreenShell";
import { api } from "../api/client";

export function WorkspaceOverviewScreen() {
  const navigate = useAuraStore((s) => s.navigate);
  const session = useAuraStore((s) => s.session);
  const setSession = useAuraStore((s) => s.setSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { graph, lessonPath, mapState, topic, sessionId } = session;
  const nodes = graph?.nodes ?? [];
  const currentIndex = lessonPath?.currentIndex ?? 0;
  const totalNodes = nodes.length;
  const mastered = nodes.filter((n) => n.status === "mastered").length;
  const shaky = nodes.filter((n) => n.status === "shaky").length;
  const overallPct = totalNodes > 0 ? Math.round((mastered / totalNodes) * 100) : 0;
  const canRevise = totalNodes > 0 && (shaky > 0 || nodes.some((n) => n.mastery > 0 && n.mastery < 0.6));
  const canFinalTest = totalNodes > 0 && mastered === totalNodes;

  const continueLesson = useCallback(async () => {
    if (!sessionId || loading) return;
    if (session.cards.length > 0) {
      navigate("lesson");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const activeNodeId = lessonPath?.items[currentIndex]?.nodeId;
      if (activeNodeId) {
        const result = await api.generateNodeCards(sessionId, activeNodeId);
        setSession({ cards: result.cards, cardCursor: 0 });
      }
      navigate("lesson");
    } catch {
      navigate("lesson");
    } finally {
      setLoading(false);
    }
  }, [sessionId, loading, session.cards.length, lessonPath, currentIndex, setSession, navigate]);

  const revise = useCallback(async () => {
    if (!sessionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.workspaceRevise(sessionId);
      setSession({ cards: result.cards, cardCursor: 0 });
      navigate("lesson");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start revision.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, loading, setSession, navigate]);

  const finalTest = useCallback(async () => {
    if (!sessionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.workspaceTestFinal(sessionId);
      setSession({ cards: result.cards, cardCursor: 0 });
      navigate("lesson");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start final test.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, loading, setSession, navigate]);

  const testLesson = useCallback(async (nodeId: string) => {
    if (!sessionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.workspaceTestLesson(sessionId, nodeId);
      setSession({ cards: result.cards, cardCursor: 0 });
      navigate("lesson");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start lesson test.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, loading, setSession, navigate]);

  if (!graph || !lessonPath) {
    return (
      <ScreenShell>
        <div className="rise" style={{ maxWidth: 600, textAlign: "center" }}>
          <h2 className="title" style={{ fontSize: 28 }}>No workspace loaded</h2>
          <p style={{ color: "var(--aura-ink-soft)", marginTop: 8 }}>
            Start from the dashboard.
          </p>
          <button className="btn btn--sage" onClick={() => navigate("dashboard")} style={{ marginTop: 16 }}>
            Go to dashboard
          </button>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <div className="rise" style={{ maxWidth: 780, width: "100%", display: "flex", flexDirection: "column", gap: 28 }}>
        {/* Header */}
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
            workspace
          </div>
          <h1 className="title" style={{ fontSize: 40, margin: 0, lineHeight: 1.1 }}>
            {topic}
          </h1>
          <p style={{ fontSize: 15, color: "var(--aura-ink-soft)", marginTop: 10, lineHeight: 1.6 }}>
            {mastered} of {totalNodes} lessons mastered · {overallPct}% complete
            {shaky > 0 && <span style={{ color: "var(--aura-clay)" }}> · {shaky} shaky</span>}
          </p>
        </div>

        {/* Overall progress bar */}
        <div>
          <div style={{ height: 8, borderRadius: 999, background: "var(--aura-line-soft)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${overallPct}%`,
                background: "linear-gradient(to right, var(--aura-sage), var(--aura-peach))",
                borderRadius: 999,
                transition: "width .5s",
              }}
            />
          </div>
        </div>

        {/* Node list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {nodes.map((node, i) => {
            const isActive = i === currentIndex;
            const isMastered = node.status === "mastered";
            const isShaky = node.status === "shaky";
            const isLocked = node.status === "locked";

            let statusColor = "var(--aura-line)";
            let statusLabel = "";
            if (isMastered) { statusColor = "var(--aura-sage)"; statusLabel = "mastered"; }
            else if (isShaky) { statusColor = "var(--aura-clay)"; statusLabel = "shaky"; }
            else if (isActive) { statusColor = "var(--aura-peach)"; statusLabel = "current"; }
            else if (isLocked) { statusLabel = "locked"; }

            return (
              <motion.div
                key={node.id}
                className="rise"
                style={{
                  padding: "16px 20px",
                  borderRadius: 16,
                  background: isActive ? "var(--aura-paper)" : "var(--aura-paper-2)",
                  border: `1.5px solid ${isActive ? "var(--aura-sage)" : "var(--aura-line-soft)"}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  boxShadow: isActive ? "var(--aura-shadow)" : "none",
                  opacity: isLocked ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    flex: "0 0 36px",
                    height: 36,
                    borderRadius: 10,
                    background: isActive ? "var(--aura-sage-wash)" : "var(--aura-paper)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "JetBrains Mono",
                    fontSize: 13,
                    color: isActive ? "var(--aura-sage-deep)" : "var(--aura-ink-mute)",
                    border: `1px solid ${isActive ? "var(--aura-sage-soft)" : "var(--aura-line)"}`,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{node.topicName}</div>
                  <div style={{ fontSize: 12, color: "var(--aura-ink-mute)", marginTop: 2 }}>
                    {Math.round(node.mastery * 100)}% mastery
                  </div>
                </div>
                {/* Mastery bar */}
                <div style={{ width: 80 }}>
                  <div style={{ height: 4, borderRadius: 999, background: "var(--aura-line-soft)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${node.mastery * 100}%`, background: statusColor, borderRadius: 999 }} />
                  </div>
                </div>
                {statusLabel && (
                  <span
                    className="chip"
                    data-tone={isMastered ? "sage" : isShaky ? "clay" : isActive ? "peach" : undefined}
                    style={{ padding: "3px 8px", fontSize: 10 }}
                  >
                    <span className="dot" />
                    {statusLabel}
                  </span>
                )}
                {isMastered && (
                  <button
                    type="button"
                    onClick={() => testLesson(node.id)}
                    disabled={loading}
                    style={{
                      padding: "6px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 999,
                      border: "1px solid var(--aura-peach-soft)",
                      background: "var(--aura-peach-wash)",
                      color: "var(--aura-clay)",
                      cursor: loading ? "not-allowed" : "pointer",
                      font: "inherit",
                      letterSpacing: ".02em",
                      transition: "all .15s",
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    Test
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn btn--ghost" onClick={() => navigate("dashboard")}>
            ← Dashboard
          </button>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn--ghost" onClick={() => navigate("insights")}>
              Insights
            </button>
            <button
              className="btn btn--ghost"
              onClick={revise}
              disabled={loading || !canRevise}
              title={canRevise ? "Revise shaky concepts" : "Nothing to revise yet"}
            >
              Revise
            </button>
            <button
              className={canFinalTest ? "btn btn--sage" : "btn btn--ghost"}
              onClick={finalTest}
              disabled={loading || !canFinalTest}
              title={canFinalTest ? "Final test across this workspace" : "Master all lessons to unlock"}
            >
              Final test
            </button>
            <button className="btn btn--sage" onClick={continueLesson} disabled={loading}>
              {loading ? "Loading..." : `Continue lesson ${currentIndex + 1} →`}
            </button>
          </div>
        </div>
        {error && (
          <div style={{ fontSize: 13, color: "var(--aura-clay)", textAlign: "right" }}>{error}</div>
        )}
      </div>
    </ScreenShell>
  );
}
