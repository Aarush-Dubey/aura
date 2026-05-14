import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("workspace");
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
            {t('stepXofY', { step: 2, total: 3 })}
          </div>
          <h1 className="title" style={{ fontSize: 44, margin: 0, lineHeight: 1.1 }}>
            {t('whatToLearn')}
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
            {t('plainLanguage')}
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
            {t('auraMightAsk')}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Clarifier q={t('howMuchKnow')} pick={t('comfortableUser')} />
            <Clarifier q={t('howLongPerSession')} pick={t('fifteenMinutes')} />
            <Clarifier q={t('whyLearnThis')} pick={t('curiousPodcast')} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="btn btn--ghost" onClick={() => navigate("workspace_create")}>
            {t('common:back')}
          </button>
          <button className="btn btn--sage" onClick={() => { setSession({ goal }); navigate("plan"); }}>
            {t('buildMyPlan')}
          </button>
        </div>
      </div>
    </ScreenShell>
  );
}
