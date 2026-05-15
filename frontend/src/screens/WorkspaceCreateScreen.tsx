import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuraStore } from "../store/useAuraStore";
import { ScreenShell } from "../components/shell/ScreenShell";

export function WorkspaceCreateScreen() {
  const { t } = useTranslation("workspace");
  const navigate = useAuraStore((s) => s.navigate);
  const setSession = useAuraStore((s) => s.setSession);
  const [name, setName] = useState("CPU intro");

  function handleContinue() {
    setSession({ topic: name });
    navigate("goal");
  }

  return (
    <ScreenShell>
      <div className="rise" style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 28 }}>
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
            {t('stepXofY', { step: 1, total: 3 })}
          </div>
          <h1 className="title" style={{ fontSize: 44, margin: 0, lineHeight: 1.1 }}>
            {t('createWorkspace')}
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
            {t('oneWorkspacePerSubject')}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".02em" }}>
            {t('nameWorkspace')}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              padding: "14px 18px",
              borderRadius: 14,
              border: "1.5px solid var(--aura-line)",
              background: "var(--aura-paper)",
              font: "inherit",
              fontSize: 16,
              color: "inherit",
              outline: "none",
              letterSpacing: "inherit",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn--sage" onClick={handleContinue}>
            {t('continueArrow')}
          </button>
        </div>
      </div>
    </ScreenShell>
  );
}
