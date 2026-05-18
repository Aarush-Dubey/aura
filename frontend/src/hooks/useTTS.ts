import { useState, useRef, useCallback } from "react";
import { API_BASE } from "../api/client";
import { useAuraStore } from "../store/useAuraStore";

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [words, setWords] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const language = useAuraStore((s) => s.settings.language);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setHighlightIndex(-1);
    setWords([]);
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      audioRef.current = null;
    }
    if (urlRef.current) {
      try { URL.revokeObjectURL(urlRef.current); } catch {}
      urlRef.current = null;
    }
    clearTimers();
    setSpeaking(false);
  }, [clearTimers]);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    stop();
    setSpeaking(true);
    const wordList = text.split(/\s+/).filter(Boolean);
    setWords(wordList);
    try {
      const res = await fetch(`${API_BASE}/tts/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
      });
      if (!res.ok) throw new Error("TTS request failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        if (duration > 0 && wordList.length > 0) {
          const msPerWord = (duration * 1000) / wordList.length;
          let idx = 0;
          setHighlightIndex(0);
          timerRef.current = window.setInterval(() => {
            idx++;
            if (idx >= wordList.length) {
              if (timerRef.current !== null) clearInterval(timerRef.current);
              return;
            }
            setHighlightIndex(idx);
          }, msPerWord);
        }
      };

      const cleanup = () => {
        setSpeaking(false);
        clearTimers();
        if (urlRef.current === url) {
          URL.revokeObjectURL(url);
          urlRef.current = null;
        }
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      try {
        await audio.play();
      } catch {
        setSpeaking(false);
        clearTimers();
      }
    } catch {
      setSpeaking(false);
      clearTimers();
    }
  }, [stop, language, clearTimers]);

  return { speak, stop, speaking, highlightIndex, words };
}
