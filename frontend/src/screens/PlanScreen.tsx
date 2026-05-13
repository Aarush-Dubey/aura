import { useState } from "react";
import { useAuraStore } from "../store/useAuraStore";
import { api } from "../api/client";
import { ScreenShell } from "../components/shell/ScreenShell";
import type { LessonResponse } from "../api/types";

type NodePreview = {
  n: number;
  title: string;
  status: "active" | "upcoming";
};

export function PlanScreen() {
  const navigate = useAuraStore((s) => s.navigate);
  const loadLesson = useAuraStore((s) => s.loadLesson);
  const topic = useAuraStore((s) => s.session.topic);
  const goal = useAuraStore((s) => s.session.goal);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [generatedNodes, setGeneratedNodes] = useState<NodePreview[]>([]);
  const [response, setResponse] = useState<LessonResponse | null>(null);

  async function startLesson() {
    setBusy(true);
    for (const s of ["Planning map", "Choosing nodes", "Tracing prerequisites", "Writing first card"]) {
      setStep(s);
      await new Promise((r) => setTimeout(r, 260));
    }
    try {
      const res = await api.generateLesson(
        topic || "CPU architecture",
        { goalType: "exam", timeHorizon: "single_session", depthPreference: "working_knowledge" },
        ""
      );
      setResponse(res);
      setGeneratedNodes(
        res.graph.nodes.map((node, i) => ({
          n: i + 1,
          title: node.topicName,
          status: i === 0 ? "active" as const : "upcoming" as const,
        }))
      );
      setBusy(false);
      setStep("");
    } catch (err) {
      setStep(err instanceof Error ? err.message : "Failed to generate lesson");
      setBusy(false);
    }
  }

  function beginLesson() {
    if (!response) return;
    loadLesson(response);
    navigate("lesson");
  }

  const nodes = generatedNodes;
  const hasNodes = nodes.length > 0;

  return (
    <ScreenShell>
      <div
        className="rise"
        style={{ maxWidth: 740, display: "flex", flexDirection: "column", gap: 26, width: "100%" }}
      >
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
            step 3 of 3
          </div>
          <h1 className="title" style={{ fontSize: 44, margin: 0, lineHeight: 1.1 }}>
            {hasNodes ? "Your plan is ready." : "Build your plan."}
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "var(--aura-ink-soft)",
              marginTop: 10,
              maxWidth: "58ch",
              lineHeight: 1.6,
            }}
          >
            {hasNodes
              ? `${nodes.length} lessons for ${topic}. The order adapts as Aura learns what works.`
              : `Click below to generate a lesson plan for ${topic}.`}
          </p>
          {goal && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 16px",
                borderRadius: 12,
                background: "var(--aura-paper-2)",
                border: "1px solid var(--aura-line-soft)",
                fontSize: 13,
                color: "var(--aura-ink-soft)",
                lineHeight: 1.5,
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--aura-ink)", marginRight: 6 }}>Goal:</span>
              {goal}
            </div>
          )}
        </div>

        {hasNodes && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nodes.map((m) => (
              <div
                key={m.n}
                className="rise"
                style={{
                  padding: "18px 22px",
                  borderRadius: 16,
                  background: m.status === "active" ? "var(--aura-paper)" : "var(--aura-paper-2)",
                  border:
                    "1px solid " +
                    (m.status === "active" ? "var(--aura-sage)" : "var(--aura-line-soft)"),
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  boxShadow: m.status === "active" ? "var(--aura-shadow)" : "none",
                }}
              >
                <div
                  style={{
                    flex: "0 0 36px",
                    height: 36,
                    borderRadius: 10,
                    background: m.status === "active" ? "var(--aura-sage-wash)" : "var(--aura-paper)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "JetBrains Mono",
                    fontSize: 13,
                    color: m.status === "active" ? "var(--aura-sage-deep)" : "var(--aura-ink-mute)",
                    border:
                      "1px solid " +
                      (m.status === "active" ? "var(--aura-sage-soft)" : "var(--aura-line)"),
                  }}
                >
                  {m.n}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{m.title}</div>
                </div>
                {m.status === "active" && (
                  <span className="chip" data-tone="sage" style={{ padding: "4px 10px" }}>
                    <span className="dot" />
                    first up
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {busy && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 20px",
              borderRadius: 14,
              background: "var(--aura-sage-wash)",
              border: "1px solid var(--aura-sage-soft)",
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 35% 35%, var(--aura-peach), var(--aura-sage))",
                animation: "aura-breath 1.6s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: 14, color: "var(--aura-sage-deep)" }}>{step}</span>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <button className="btn btn--ghost" onClick={() => navigate("goal")}>
            Edit plan
          </button>
          {hasNodes ? (
            <button className="btn btn--sage" onClick={beginLesson}>
              Start lesson 1 →
            </button>
          ) : (
            <button className="btn btn--sage" onClick={startLesson} disabled={busy}>
              {busy ? "Building..." : "Generate plan →"}
            </button>
          )}
        </div>
      </div>
    </ScreenShell>
  );
}
