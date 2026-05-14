import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { useAuraStore } from "../../store/useAuraStore";
import { api } from "../../api/client";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import { useTTS } from "../../hooks/useTTS";

export function ChatOverlay() {
  const { t } = useTranslation("chat");
  const isOpen = useAuraStore((s) => s.chat.isOpen);
  const mode = useAuraStore((s) => s.chat.mode);
  const messages = useAuraStore((s) => s.chat.messages);
  const isLoading = useAuraStore((s) => s.chat.isLoading);
  const sessionId = useAuraStore((s) => s.session.sessionId);
  const cards = useAuraStore((s) => s.session.cards);
  const cardCursor = useAuraStore((s) => s.session.cardCursor);
  const closeChat = useAuraStore((s) => s.closeChat);
  const addChatMessage = useAuraStore((s) => s.addChatMessage);
  const setChatLoading = useAuraStore((s) => s.setChatLoading);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { recording, transcribing, startRecording, stopRecording } = useAudioRecorder();
  const { speak: ttsSpeak, speaking: ttsSpeaking } = useTTS();

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) closeChat();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, closeChat]);

  async function sendText(text: string) {
    if (!text.trim()) return;
    addChatMessage({ role: "student", text, at: Date.now() });
    setChatLoading(true);
    try {
      const current = cards[cardCursor];
      const cardContext = current
        ? {
            type: current.type,
            title: "title" in current ? (current as any).title : undefined,
            body:
              "body" in current
                ? typeof (current as any).body === "string"
                  ? (current as any).body
                  : Array.isArray((current as any).body)
                  ? (current as any).body.join(" ")
                  : undefined
                : "prompt" in current
                ? (current as any).prompt
                : undefined,
          }
        : undefined;
      const response = await api.chatAsk(sessionId, text, cardContext);
      const reply = response.reply;
      addChatMessage({ role: "aura", text: reply, at: Date.now() });
      if (mode === "voice") ttsSpeak(reply);
    } catch {
      addChatMessage({ role: "aura", text: t('errorProcessing'), at: Date.now() });
    } finally {
      setChatLoading(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendText(text);
  }

  async function handleVoiceToggle() {
    if (recording) {
      const text = await stopRecording();
      if (text) await sendText(text);
    } else {
      await startRecording();
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: "55vh",
            maxHeight: 480,
            background: "var(--aura-paper)",
            borderTop: "1px solid var(--aura-line)",
            borderRadius: "24px 24px 0 0",
            boxShadow: "0 -8px 32px rgba(60,45,25,.12)",
            display: "flex",
            flexDirection: "column",
            zIndex: 50,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--aura-line-soft)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 35%, var(--aura-peach), var(--aura-sage))",
                }}
              />
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('askAura')}</span>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "var(--aura-sage-wash)",
                  color: "var(--aura-sage-deep)",
                  fontFamily: "JetBrains Mono",
                }}
              >
                {mode}
              </span>
            </div>
            <button
              onClick={closeChat}
              style={{
                background: "transparent",
                border: 0,
                cursor: "pointer",
                padding: 6,
                borderRadius: 8,
                color: "var(--aura-ink-mute)",
                font: "inherit",
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflow: "auto",
              padding: "16px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--aura-ink-mute)", padding: 24, fontSize: 14 }}>
                {t('askAnything')}
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === "student" ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                }}
              >
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: msg.role === "student" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: msg.role === "student" ? "var(--aura-sage)" : "var(--aura-paper-2)",
                    color: msg.role === "student" ? "#fff" : "var(--aura-ink)",
                    fontSize: 14,
                    lineHeight: 1.55,
                    border: msg.role === "aura" ? "1px solid var(--aura-line-soft)" : "none",
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ alignSelf: "flex-start" }}>
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: "16px 16px 16px 4px",
                    background: "var(--aura-paper-2)",
                    border: "1px solid var(--aura-line-soft)",
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  {[0, 1, 2].map((j) => (
                    <span
                      key={j}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--aura-sage)",
                        animation: `aura-breath 1.2s ease-in-out ${j * 0.15}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div
            style={{
              padding: "12px 24px 16px",
              borderTop: "1px solid var(--aura-line-soft)",
              display: "flex",
              gap: 10,
            }}
          >
            <button
              onMouseDown={handleVoiceToggle}
              className={recording ? "btn btn--peach" : "btn btn--ghost"}
              style={{ padding: "10px 14px", fontSize: 13, position: "relative" }}
              disabled={transcribing || isLoading}
            >
              {recording ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#e74c3c", animation: "aura-breath 1s infinite" }} />
                  {t('common:release')}
                </span>
              ) : transcribing ? "..." : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                </svg>
              )}
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t('typeQuestion')}
              style={{
                flex: 1,
                padding: "12px 18px",
                borderRadius: 14,
                border: "1.5px solid var(--aura-line)",
                background: "var(--aura-paper-2)",
                font: "inherit",
                fontSize: 14,
                color: "inherit",
                outline: "none",
                letterSpacing: "inherit",
              }}
            />
            <button
              className="btn btn--sage"
              onClick={send}
              disabled={!input.trim() || isLoading}
              style={{ padding: "10px 18px", fontSize: 13 }}
            >
              {t('send')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
