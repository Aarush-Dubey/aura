import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { useAuraStore } from "../../store/useAuraStore";
import { LANGUAGES } from "../../i18n/languages";
import type { SupportedLanguage } from "../../i18n/languages";
import { api } from "../../api/client";

function TweakSection({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: "var(--aura-ink-mute)",
        fontWeight: 600,
        marginTop: 14,
        marginBottom: 4,
      }}
    >
      {label}
    </div>
  );
}

function TweakToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          background: value ? "var(--aura-sage)" : "var(--aura-line)",
          position: "relative",
          transition: "background .2s",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: 2,
            left: value ? 18 : 2,
            transition: "left .2s",
            boxShadow: "0 1px 2px rgba(0,0,0,.15)",
          }}
        />
      </div>
    </label>
  );
}

function TweakSlider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: "var(--aura-ink-mute)", fontFamily: "JetBrains Mono", fontSize: 12 }}>
          {value}{unit ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--aura-sage)" }}
      />
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ fontSize: 13, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6 }}>
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            style={{
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: 12,
              border: "1px solid " + (value === o ? "var(--aura-sage)" : "var(--aura-line)"),
              background: value === o ? "var(--aura-sage-wash)" : "var(--aura-paper-2)",
              color: value === o ? "var(--aura-sage-deep)" : "var(--aura-ink-soft)",
              cursor: "pointer",
              font: "inherit",
              fontWeight: value === o ? 600 : 400,
              transition: "all .15s",
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TweaksPanel() {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const settings = useAuraStore((s) => s.settings);
  const profile = useAuraStore((s) => s.profile);
  const setSetting = useAuraStore((s) => s.setSetting);
  const setProfile = useAuraStore((s) => s.setProfile);

  const saveProfile = async (patch: Record<string, unknown>) => {
    const next = await api.updateProfile(patch).catch(() => null);
    if (next) setProfile(next);
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "var(--aura-paper)",
          border: "1px solid var(--aura-line)",
          boxShadow: "var(--aura-shadow)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 40,
          fontSize: 16,
          color: "var(--aura-ink-soft)",
        }}
        title={t('accessibilitySettings')}
      >
        ⚙
      </button>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 300,
              background: "var(--aura-paper)",
              borderLeft: "1px solid var(--aura-line)",
              boxShadow: "-4px 0 24px rgba(60,45,25,.1)",
              padding: "24px 20px",
              overflow: "auto",
              zIndex: 45,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{t('settings')}</span>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: 0, cursor: "pointer", fontSize: 16, color: "var(--aura-ink-mute)", padding: 4 }}>
                ✕
              </button>
            </div>

            <TweakSection label={t('language')} />
            <div style={{ padding: "6px 0" }}>
              <select
                value={settings.language}
                onChange={(e) => {
                  const language = e.target.value as SupportedLanguage;
                  setSetting("language", language);
                  void saveProfile({ language });
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--aura-line)",
                  background: "var(--aura-paper-2)",
                  color: "var(--aura-ink)",
                  font: "inherit",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: "var(--aura-ink-mute)", marginTop: 4 }}>
                {t('languageNote')}
              </div>
            </div>

            <TweakSection label={t('profile', { defaultValue: 'Profile' })} />
            <div style={{ padding: "6px 0", display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13 }}>{t('name', { defaultValue: 'Name' })}</label>
              <input
                value={profile?.name ?? ""}
                onChange={(e) => setProfile(profile ? { ...profile, name: e.target.value } : null)}
                onBlur={(e) => void saveProfile({ name: e.target.value })}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--aura-line)",
                  background: "var(--aura-paper-2)",
                  color: "var(--aura-ink)",
                  font: "inherit",
                  fontSize: 13,
                }}
              />
            </div>

            <TweakSection label={t('reading')} />
            <TweakRadio label={t('font')} value={settings.font} options={["lexend", "opendyslexic", "system"]} onChange={(v) => setSetting("font", v as any)} />
            <TweakSlider label={t('letterSpacing')} value={settings.letterSpacing} min={0} max={0.12} step={0.01} unit="em" onChange={(v) => setSetting("letterSpacing", v)} />
            <TweakSlider label={t('lineHeight')} value={settings.lineHeight} min={1.3} max={2.2} step={0.05} onChange={(v) => setSetting("lineHeight", v)} />
            <TweakToggle label={t('bionicReading')} value={settings.bionicReading} onChange={(v) => setSetting("bionicReading", v)} />

            <TweakSection label={t('audio')} />
            <TweakToggle label={t('readAloud')} value={settings.readAloud} onChange={(v) => setSetting("readAloud", v)} />
            <TweakSlider label={t('speed')} value={settings.readSpeed} min={0.7} max={1.5} step={0.05} unit="×" onChange={(v) => setSetting("readSpeed", v)} />

            <TweakSection label={t('environment')} />
            <TweakRadio label={t('background')} value={settings.bgTone} options={["cream", "white", "mint", "dark"]} onChange={(v) => setSetting("bgTone", v as any)} />
            <TweakRadio label={t('animation')} value={settings.animation} options={["calm", "lively"]} onChange={(v) => setSetting("animation", v as any)} />

            <TweakSection label={t('focus')} />
            <TweakToggle label={t('focusMode')} value={settings.focusMode} onChange={(v) => setSetting("focusMode", v)} />
            <TweakRadio label={t('focusBlockLength')} value={String(settings.focusBlockMinutes)} options={["5", "10", "20", "25"]} onChange={(v) => setSetting("focusBlockMinutes", Number(v) as 5 | 10 | 20 | 25)} />
            <TweakToggle label={t('proactiveBreaks')} value={settings.proactiveBreaks} onChange={(v) => setSetting("proactiveBreaks", v)} />
            <TweakToggle label={t('movementBreaks')} value={settings.movementBreaks} onChange={(v) => setSetting("movementBreaks", v)} />
            <TweakToggle label={t('breakGames')} value={settings.breakGames} onChange={(v) => setSetting("breakGames", v)} />
            <TweakToggle
              label={t('adhdSupport', { defaultValue: 'ADHD support' })}
              value={!!profile?.adhdSupport}
              onChange={(v) => void saveProfile({ adhdSupport: v })}
            />
            <TweakToggle
              label={t('dyslexiaSupport', { defaultValue: 'Dyslexia support' })}
              value={!!profile?.dyslexiaMode}
              onChange={(v) => void saveProfile({ dyslexiaMode: v })}
            />
            <div style={{ fontSize: 11, color: "var(--aura-ink-mute)", marginTop: 8 }}>
              {t('rewards', { defaultValue: 'Rewards' })}: {profile?.xp ?? 0} XP · {profile?.streak ?? 0}d
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
