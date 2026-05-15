import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";
import { useAuraStore } from "../../../store/useAuraStore";

type Data = {
  prompt?: string;
  body?: string;
  reason?: "timer" | "blur" | "stuck" | "manual";
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function BreakCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t: tr } = useTranslation("cards");
  const movementBreaks = useAuraStore((s) => s.settings.movementBreaks);
  const breakGames = useAuraStore((s) => s.settings.breakGames);
  const trackEffort = useAuraStore((s) => s.trackEffort);
  const [mode, setMode] = useState<"choose" | "breathe" | "move" | "rhythm" | "dot">("choose");
  const [t, setT] = useState(60);
  const [tapCount, setTapCount] = useState(0);
  const [beatOn, setBeatOn] = useState(false);
  const [dot, setDot] = useState({ x: 50, y: 50 });

  useEffect(() => {
    trackEffort({ type: "break_started", label: data.reason ?? "break" });
  }, [data.reason, trackEffort]);

  useEffect(() => {
    if (mode === "choose") return;
    setT(mode === "breathe" ? 60 : 45);
    setTapCount(0);
  }, [mode]);

  useEffect(() => {
    if (mode === "choose") return;
    const id = setInterval(() => setT((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(id);
  }, [mode]);

  useEffect(() => {
    if (mode !== "rhythm") return;
    const id = window.setInterval(() => setBeatOn((x) => !x), 520);
    return () => window.clearInterval(id);
  }, [mode]);

  useEffect(() => {
    if (mode !== "dot") return;
    const id = window.setInterval(() => setDot({ x: 14 + Math.random() * 72, y: 16 + Math.random() * 60 }), 1300);
    return () => window.clearInterval(id);
  }, [mode]);

  const complete = () => {
    trackEffort({ type: "break_completed", label: mode === "choose" ? "skipped" : mode, detail: `${tapCount} taps` });
    ctx.onNext();
  };

  if (mode === "choose") {
    return (
      <CardChrome tone="peach" label={tr('brainBreak')} sub={tr('chooseReset')}>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="title" style={{ fontSize: 24, lineHeight: 1.3 }}>{data.prompt || tr('takeReset')}</div>
          <p style={{ margin: 0, color: "var(--aura-ink-soft)", lineHeight: 1.6 }}>{data.body || tr('breakChoiceBody')}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <button className="btn btn--peach" onClick={() => setMode("breathe")}>{tr('breathe')}</button>
            {movementBreaks && <button className="btn btn--ghost" onClick={() => setMode("move")}>{tr('move')}</button>}
            {breakGames && <button className="btn btn--ghost" onClick={() => setMode("rhythm")}>{tr('tapRhythm')}</button>}
            {breakGames && <button className="btn btn--ghost" onClick={() => setMode("dot")}>{tr('dotFocus')}</button>}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn--ghost" onClick={complete}>{tr('skipBreak')}</button>
          </div>
        </div>
      </CardChrome>
    );
  }

  if (mode === "move") {
    const moves = [tr('moveShoulders'), tr('moveLookAway'), tr('moveHands'), tr('moveWater')];
    return (
      <CardChrome tone="peach" label={tr('brainBreak')} sub={tr('movementReset')}>
        <div style={{ padding: "28px 20px", display: "grid", placeItems: "center", gap: 18, textAlign: "center" }}>
          <div className="title" style={{ fontSize: 25 }}>{moves[tapCount % moves.length]}</div>
          <div style={{ color: "var(--aura-ink-soft)" }}>{tr('movementBody')}</div>
          <div style={{ fontFamily: "JetBrains Mono", color: "var(--aura-ink-mute)" }}>{fmt(t)}</div>
          <button className="btn btn--peach" onClick={() => setTapCount((x) => x + 1)}>{tr('nextMove')}</button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <button className="btn btn--ghost" onClick={complete}>{tr('imBack')}</button>
          {t === 0 && <button className="btn btn--sage" onClick={complete}>{tr('continueLesson')}</button>}
        </div>
      </CardChrome>
    );
  }

  if (mode === "rhythm") {
    return (
      <CardChrome tone="amber" label={tr('tapRhythm')} sub={tr('shortGame')}>
        <div style={{ padding: "28px 20px", display: "grid", placeItems: "center", gap: 18 }}>
          <button
            onClick={() => setTapCount((x) => x + 1)}
            style={{
              width: 150,
              height: 150,
              borderRadius: "50%",
              border: "1px solid var(--aura-line)",
              background: beatOn ? "var(--aura-peach)" : "var(--aura-amber-wash)",
              color: beatOn ? "#fff" : "var(--aura-ink)",
              font: "inherit",
              fontSize: 18,
              fontWeight: 700,
              cursor: "pointer",
              transform: beatOn ? "scale(1.05)" : "scale(1)",
              transition: "all .18s",
            }}
          >
            {tr('tap')}
          </button>
          <div style={{ fontFamily: "JetBrains Mono", color: "var(--aura-ink-mute)" }}>{fmt(t)} · {tapCount} {tr('taps')}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <button className="btn btn--ghost" onClick={complete}>{tr('imBack')}</button>
          {t === 0 && <button className="btn btn--sage" onClick={complete}>{tr('continueLesson')}</button>}
        </div>
      </CardChrome>
    );
  }

  if (mode === "dot") {
    return (
      <CardChrome tone="sky" label={tr('dotFocus')} sub={tr('shortGame')}>
        <div style={{ display: "grid", gap: 14 }}>
          <p style={{ margin: 0, color: "var(--aura-ink-soft)", textAlign: "center" }}>{tr('dotFocusBody')}</p>
          <div style={{ position: "relative", height: 230, borderRadius: 18, background: "var(--aura-paper-2)", border: "1px solid var(--aura-line)", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: "50%", background: "var(--aura-ink-mute)" }} />
            <button
              onClick={() => {
                setTapCount((x) => x + 1);
                setDot({ x: 14 + Math.random() * 72, y: 16 + Math.random() * 60 });
              }}
              style={{
                position: "absolute",
                left: `${dot.x}%`,
                top: `${dot.y}%`,
                width: 34,
                height: 34,
                marginLeft: -17,
                marginTop: -17,
                borderRadius: "50%",
                border: 0,
                background: "var(--aura-sage)",
                boxShadow: "0 0 0 8px rgba(107,158,126,.15)",
                cursor: "pointer",
              }}
              aria-label={tr('dotFocus')}
            />
          </div>
          <div style={{ textAlign: "center", fontFamily: "JetBrains Mono", color: "var(--aura-ink-mute)" }}>{fmt(t)} · {tapCount}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <button className="btn btn--ghost" onClick={complete}>{tr('imBack')}</button>
          {t === 0 && <button className="btn btn--sage" onClick={complete}>{tr('continueLesson')}</button>}
        </div>
      </CardChrome>
    );
  }

  return (
    <CardChrome tone="peach" label={tr('brainBreak')} sub={tr('sixtySeconds')}>
      <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--aura-peach-soft) 0%, var(--aura-peach-wash) 70%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "aura-breath 4s ease-in-out infinite",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "var(--aura-paper)",
              boxShadow: "var(--aura-shadow)",
            }}
          />
        </div>
        <div className="title" style={{ fontSize: 24, textAlign: "center", lineHeight: 1.3 }}>
          {data.prompt || tr('breatheInOut')}
        </div>
        <div style={{ fontSize: 14, color: "var(--aura-ink-soft)", textAlign: "center", maxWidth: "40ch" }}>
          {data.body || tr('standUp')}
        </div>
        <div style={{ fontFamily: "JetBrains Mono", fontSize: 14, color: "var(--aura-ink-mute)" }}>{fmt(t)}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
        <button className="btn btn--ghost" onClick={complete}>{tr('skipBreak')}</button>
        {t === 0 && <button className="btn btn--sage" onClick={complete}>{tr('imBack')}</button>}
      </div>
    </CardChrome>
  );
}
