import { motion } from "motion/react";
import { LANGUAGES } from "../../i18n/languages";
import type { SupportedLanguage } from "../../i18n/languages";
import { useAuraStore } from "../../store/useAuraStore";

export function LanguageSelectScreen() {
  const setSetting = useAuraStore((s) => s.setSetting);

  const pick = (code: SupportedLanguage) => {
    setSetting("language", code);
    localStorage.setItem("aura-language-chosen", "1");
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        background: "var(--aura-bg)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--aura-ink)", margin: 0 }}>
          Choose your language
        </h1>
        <p style={{ fontSize: 14, color: "var(--aura-ink-mute)", marginTop: 8 }}>
          You can change this anytime in settings.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
          maxWidth: 400,
          width: "100%",
          padding: "0 24px",
        }}
      >
        {LANGUAGES.map((lang, i) => (
          <motion.button
            key={lang.code}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => pick(lang.code)}
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              border: "1px solid var(--aura-line)",
              background: "var(--aura-paper)",
              cursor: "pointer",
              font: "inherit",
              fontSize: 16,
              fontWeight: 500,
              color: "var(--aura-ink)",
              textAlign: "center",
              transition: "all .15s",
              boxShadow: "var(--aura-shadow)",
            }}
            whileHover={{
              borderColor: "var(--aura-sage)",
              background: "var(--aura-sage-wash)",
            }}
            whileTap={{ scale: 0.97 }}
          >
            {lang.nativeName}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
