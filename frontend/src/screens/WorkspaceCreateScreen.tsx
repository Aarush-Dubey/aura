import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuraStore, type LearnerMode } from "../store/useAuraStore";
import { ScreenShell } from "../components/shell/ScreenShell";

function ProfileTile({
  active,
  title,
  body,
  tone,
  onClick,
}: {
  active: boolean;
  title: string;
  body: string;
  tone: "sage" | "peach";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "16px 18px",
        borderRadius: 14,
        cursor: "pointer",
        background: active
          ? tone === "sage"
            ? "var(--aura-sage-wash)"
            : "var(--aura-peach-wash)"
          : "var(--aura-paper)",
        border:
          "1.5px solid " +
          (active
            ? tone === "sage"
              ? "var(--aura-sage)"
              : "var(--aura-peach)"
            : "var(--aura-line)"),
        font: "inherit",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        transition: "all .2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 6,
            background: active
              ? tone === "sage"
                ? "var(--aura-sage)"
                : "var(--aura-peach)"
              : "transparent",
            border:
              "1.5px solid " +
              (active
                ? tone === "sage"
                  ? "var(--aura-sage)"
                  : "var(--aura-peach)"
                : "var(--aura-line)"),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 11,
          }}
        >
          {active && "✓"}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--aura-ink-soft)", lineHeight: 1.5 }}>{body}</div>
    </button>
  );
}

export function WorkspaceCreateScreen() {
  const { t } = useTranslation("workspace");
  const navigate = useAuraStore((s) => s.navigate);
  const setSession = useAuraStore((s) => s.setSession);
  const setSetting = useAuraStore((s) => s.setSetting);
  const [name, setName] = useState("CPU intro");
  const [dys, setDys] = useState(true);
  const [adhd, setAdhd] = useState(true);

  function handleContinue() {
    const mode: LearnerMode = dys && adhd ? "both" : dys ? "dyslexia" : adhd ? "adhd" : "none";
    setSetting("learnerMode", mode);
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

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".02em" }}>
              {t('howDoYouLearn')}
            </label>
            <div style={{ fontSize: 12, color: "var(--aura-ink-soft)", marginTop: 2 }}>
              {t('pickAnyThatApply')}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ProfileTile
              active={dys}
              onClick={() => setDys((d) => !d)}
              title={t('dyslexiaFriendly')}
              body={t('dyslexiaDesc')}
              tone="sage"
            />
            <ProfileTile
              active={adhd}
              onClick={() => setAdhd((a) => !a)}
              title={t('adhdFriendly')}
              body={t('adhdDesc')}
              tone="peach"
            />
          </div>
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
