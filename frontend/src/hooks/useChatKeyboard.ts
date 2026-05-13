import { useEffect } from "react";
import { useAuraStore } from "../store/useAuraStore";

export function useChatKeyboard() {
  const openChat = useAuraStore((s) => s.openChat);
  const isOpen = useAuraStore((s) => s.chat.isOpen);
  const screen = useAuraStore((s) => s.screen);

  useEffect(() => {
    if (screen !== "lesson") return;

    const handler = (e: KeyboardEvent) => {
      if (isOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "c" || e.key === "k") {
        e.preventDefault();
        openChat("keyboard");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, isOpen, openChat]);
}
