import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuraStore } from "../store/useAuraStore";
import { api } from "../api/client";
import { ScreenShell } from "../components/shell/ScreenShell";
import type { LessonResponse } from "../api/types";

type NodePreview = {
  n: number;
  title: string;
  status: "active" | "upcoming";
};

function safeJobLabel(label?: string) {
  if (!label) return "";
  if (label.length > 80 || /You are Aura|Return JSON|Generate exactly|LANGUAGE:/i.test(label)) {
    return "Gemma is preparing lesson cards";
  }
  return label;
}

export function PlanScreen() {
  const { t } = useTranslation("workspace");
  const navigate = useAuraStore((s) => s.navigate);
  const loadLesson = useAuraStore((s) => s.loadLesson);
  const topic = useAuraStore((s) => s.session.topic);
  const goal = useAuraStore((s) => s.session.goal);
  const telemetry = useAuraStore((s) => s.telemetry);
  const llmHealth = useAuraStore((s) => s.llmHealth);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [generatedNodes, setGeneratedNodes] = useState<NodePreview[]>([]);
  const [response, setResponse] = useState<LessonResponse | null>(null);

  async function startLesson() {
    setBusy(true);
    for (const s of [t('planningMap'), t('choosingNodes'), t('tracingPrerequisites'), t('writingFirstCard')]) {
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
            {t('stepXofY', { step: 3, total: 3 })}
          </div>
          <h1 className="title" style={{ fontSize: 44, margin: 0, lineHeight: 1.1 }}>
            {hasNodes ? t('yourPlanReady') : t('buildYourPlan')}
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
              ? t('lessonsForTopic', { count: nodes.length, topic })
              : t('clickToGenerate', { topic })}
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
              <span style={{ fontWeight: 600, color: "var(--aura-ink)", marginRight: 6 }}>{t('goalLabel')}:</span>
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
                    {t('firstUp')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {busy && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "24px 1fr",
              alignItems: "start",
              gap: 14,
              padding: "18px 20px",
              borderRadius: 14,
              background: llmHealth && !llmHealth.ready ? "var(--aura-clay-soft)" : "var(--aura-sage-wash)",
              border: "1px solid " + (llmHealth && !llmHealth.ready ? "var(--aura-clay)" : "var(--aura-sage-soft)"),
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
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, color: llmHealth && !llmHealth.ready ? "var(--aura-clay)" : "var(--aura-sage-deep)", fontWeight: 600 }}>
                {llmHealth && !llmHealth.ready ? `Gemma offline: ${llmHealth.detail ?? "local model not reachable"}` : step}
              </span>
              {telemetry?.activeJob && (
                <span style={{ fontSize: 12, color: "var(--aura-ink-mute)" }}>
                  {safeJobLabel(telemetry.activeJob.label)} · queue {telemetry.waitingJobs}
                </span>
              )}
            </div>
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
            {t('common:editPlan')}
          </button>
          {hasNodes ? (
            <button className="btn btn--sage" onClick={beginLesson}>
              {t('startLesson')}
            </button>
          ) : (
            <button className="btn btn--sage" onClick={startLesson} disabled={busy}>
              {busy ? t('building') : t('generatePlan')}
            </button>
          )}
        </div>
      </div>
    </ScreenShell>
  );
}
