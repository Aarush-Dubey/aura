import { useEffect, useState } from "react";
import { useAuraStore } from "./store/useAuraStore";
import { TopBar } from "./components/shell/TopBar";
import { ScreenRouter } from "./components/shell/ScreenRouter";
import { ChatOverlay } from "./components/chat/ChatOverlay";
import { TweaksPanel } from "./components/shell/TweaksPanel";
import { LanguageSelectScreen } from "./components/setup/LanguageSelectScreen";
import { useChatKeyboard } from "./hooks/useChatKeyboard";
import { useAttentionMonitor } from "./hooks/useAttentionMonitor";
import { api } from "./api/client";

export function App() {
  const settings = useAuraStore((s) => s.settings);
  const setTelemetry = useAuraStore((s) => s.setTelemetry);
  const setProfile = useAuraStore((s) => s.setProfile);
  const setLlmHealth = useAuraStore((s) => s.setLlmHealth);
  const [languageChosen, setLanguageChosen] = useState(
    () => localStorage.getItem("aura-language-chosen") === "1"
  );
  useChatKeyboard();
  useAttentionMonitor();

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  useEffect(() => {
    api.profile().then(setProfile).catch(() => {});
  }, [setProfile]);

  useEffect(() => {
    const pollHealth = () => api.health().then((h) => {
      if (h.telemetry) setTelemetry(h.telemetry);
      setLlmHealth(h.llm);
    }).catch(() => {});
    pollHealth();
    const id = setInterval(pollHealth, 10000);
    return () => clearInterval(id);
  }, [setTelemetry, setLlmHealth]);

  useEffect(() => {
    const poll = () => api.telemetry().then(setTelemetry).catch(() => undefined);
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [setTelemetry]);

  const styleVars: React.CSSProperties & Record<string, string> = {
    "--aura-ls": `${settings.letterSpacing}em`,
    "--aura-lh": `${settings.lineHeight}`,
  };

  if (!languageChosen) {
    return (
      <div className="aura" data-bg={settings.bgTone} style={styleVars as React.CSSProperties}>
        <LanguageSelectScreen onChosen={() => setLanguageChosen(true)} />
      </div>
    );
  }

  return (
    <div
      className="aura"
      data-font={settings.font}
      data-bg={settings.bgTone}
      data-anim={settings.animation}
      style={{
        ...styleVars,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <TopBar />
      <ScreenRouter />
      <ChatOverlay />
      <TweaksPanel />
    </div>
  );
}
