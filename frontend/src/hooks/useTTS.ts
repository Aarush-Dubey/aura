import { useState, useRef, useCallback } from "react";
import { API_BASE } from "../api/client";

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      audioRef.current = null;
    }
    if (urlRef.current) {
      try { URL.revokeObjectURL(urlRef.current); } catch {}
      urlRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    stop();
    setSpeaking(true);
    try {
      const res = await fetch(`${API_BASE}/tts/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("TTS request failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeaking(false);
        if (urlRef.current === url) {
          URL.revokeObjectURL(url);
          urlRef.current = null;
        }
      };
      audio.onerror = () => {
        setSpeaking(false);
        if (urlRef.current === url) {
          URL.revokeObjectURL(url);
          urlRef.current = null;
        }
      };
      try {
        await audio.play();
      } catch {
        setSpeaking(false);
      }
    } catch {
      setSpeaking(false);
    }
  }, [stop]);

  return { speak, stop, speaking };
}
