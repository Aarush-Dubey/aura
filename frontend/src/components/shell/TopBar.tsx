import { useTranslation } from "react-i18next";
import { useAuraStore, type Screen } from "../../store/useAuraStore";

const NAV_ITEMS: { screen: Screen; labelKey: string }[] = [
  { screen: "dashboard", labelKey: "home" },
  { screen: "workspace_overview", labelKey: "workspace" },
  { screen: "lesson", labelKey: "lesson" },
];

export function TopBar() {
  const { t } = useTranslation("common");
  const screen = useAuraStore((s) => s.screen);
  const navigate = useAuraStore((s) => s.navigate);
  const learnerMode = useAuraStore((s) => s.settings.learnerMode);
  const llmHealth = useAuraStore((s) => s.llmHealth);
  const llmBad = llmHealth && !llmHealth.ready;

  return (
    <header
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: "14px 32px",
        borderBottom: "1px solid var(--aura-line)",
        background: "var(--aura-paper)",
        flex: "0 0 auto",
        zIndex: 2,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", justifySelf: "start" }}
        onClick={() => navigate("dashboard")}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, var(--aura-peach), var(--aura-sage))",
          }}
        />
        <div style={{ fontWeight: 700, letterSpacing: ".04em", fontSize: 16 }}>aura</div>
      </div>

      <nav
        style={{
          display: "flex",
          gap: 6,
          fontSize: 13,
          color: "var(--aura-ink-mute)",
          alignItems: "center",
          background: "var(--aura-paper-2)",
          padding: 4,
          borderRadius: 999,
          border: "1px solid var(--aura-line-soft)",
          justifySelf: "center",
        }}
      >
        {NAV_ITEMS.map(({ screen: s, labelKey }) => {
          const active = s === screen;
          return (
            <button
              key={s}
              onClick={() => navigate(s)}
              style={{
                color: active ? "var(--aura-sage-deep)" : "var(--aura-ink-mute)",
                fontWeight: active ? 600 : 500,
                background: active ? "var(--aura-paper)" : "transparent",
                border: 0,
                cursor: "pointer",
                font: "inherit",
                padding: "8px 18px",
                borderRadius: 999,
                boxShadow: active ? "0 1px 2px rgba(34,70,46,.08), 0 4px 10px -6px rgba(34,70,46,.18)" : "none",
                transition: "all .15s ease",
                letterSpacing: ".01em",
              }}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </nav>

      <div style={{ display: "flex", gap: 8, justifySelf: "end" }}>
        <span
          className="chip"
          data-tone={llmBad ? "clay" : "sage"}
          title={llmBad ? llmHealth.detail ?? "Gemma is not reachable" : "Gemma local model ready"}
          style={{ padding: "5px 12px", fontSize: 10, color: llmBad ? "var(--aura-clay)" : undefined }}
        >
          <span className="dot" />
          {llmBad ? "Gemma offline" : "Gemma local"}
        </span>
        {(learnerMode === "both" || learnerMode === "dyslexia") && (
          <span className="chip" data-tone="sage" style={{ padding: "5px 12px", fontSize: 10 }}>
            <span className="dot" />
            {t('dyslexiaMode')}
          </span>
        )}
        {(learnerMode === "both" || learnerMode === "adhd") && (
          <span className="chip" data-tone="peach" style={{ padding: "5px 12px", fontSize: 10 }}>
            <span className="dot" />
            {t('adhdMode')}
          </span>
        )}
      </div>
    </header>
  );
}
