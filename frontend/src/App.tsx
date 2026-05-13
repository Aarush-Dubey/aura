import { useEffect } from "react";
import { useAuraStore } from "./store/useAuraStore";
import { TopBar } from "./components/shell/TopBar";
import { ScreenRouter } from "./components/shell/ScreenRouter";
import { ChatOverlay } from "./components/chat/ChatOverlay";
import { TweaksPanel } from "./components/shell/TweaksPanel";
import { useChatKeyboard } from "./hooks/useChatKeyboard";
import { useAttentionMonitor } from "./hooks/useAttentionMonitor";
import { api } from "./api/client";

export function App() {
  const settings = useAuraStore((s) => s.settings);
  const setTelemetry = useAuraStore((s) => s.setTelemetry);
  useChatKeyboard();
  useAttentionMonitor();

  useEffect(() => {
    api.health().then((h) => {
      if (h.telemetry) setTelemetry(h.telemetry);
    }).catch(() => {});
  }, [setTelemetry]);

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
