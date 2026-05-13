import { useState } from "react";
import { useAuraStore } from "../store/useAuraStore";
import { ScreenShell } from "../components/shell/ScreenShell";

function Clarifier({ q, pick }: { q: string; pick: string }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span style={{ fontSize: 13, color: "var(--aura-ink-mute)", flex: "0 0 240px" }}>{q}</span>
      <span
        style={{
          fontSize: 13,
          padding: "4px 10px",
          borderRadius: 8,
          background: "var(--aura-sage-wash)",
          color: "var(--aura-sage-deep)",
          fontWeight: 500,
        }}
      >
        {pick}
      </span>
    </div>
  );
}

export function GoalScreen() {
  const navigate = useAuraStore((s) => s.navigate);
  const setSession = useAuraStore((s) => s.setSession);
  const topic = useAuraStore((s) => s.session.topic);
  const [goal, setGoal] = useState(
    `I want to understand how ${topic || "this topic"} works — the key concepts, how they connect, and why they matter.`
  );

  return (
    <ScreenShell>
      <div className="rise" style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 26 }}>
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
            step 2 of 3
          </div>
          <h1 className="title" style={{ fontSize: 44, margin: 0, lineHeight: 1.1 }}>
            What do you want to learn?
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "var(--aura-ink-soft)",
              marginTop: 10,
              maxWidth: "52ch",
              lineHeight: 1.6,
            }}
          >
            Plain language. Don't worry about getting it right — Aura will ask follow-ups.
          </p>
        </div>

        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={5}
          style={{
            width: "100%",
            padding: "18px 22px",
            borderRadius: 18,
            border: "1.5px solid var(--aura-line)",
            background: "var(--aura-paper)",
            font: "inherit",
            fontSize: 17,
            color: "inherit",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.6,
            letterSpacing: "inherit",
          }}
        />

        <div
          style={{
            background: "var(--aura-paper)",
            padding: "18px 22px",
            borderRadius: 16,
            border: "1px solid var(--aura-line-soft)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "var(--aura-ink-mute)",
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            aura might ask
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Clarifier q="How much do you already know?" pick="Comfortable user, no CS background" />
            <Clarifier q="How long per session?" pick="15 minutes feels right" />
            <Clarifier q="Why do you want to learn this?" pick="Curious; came up in a podcast" />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="btn btn--ghost" onClick={() => navigate("workspace_create")}>
            Back
          </button>
          <button className="btn btn--sage" onClick={() => { setSession({ goal }); navigate("plan"); }}>
            Build my plan →
          </button>
        </div>
      </div>
    </ScreenShell>
  );
}
