import { useState } from "react";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Data = {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
};

export function QuizCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  return (
    <CardChrome tone="sage" label="Quick check" sub="no penalty for wrong">
      <h2 className="title" style={{ fontSize: 24, margin: 0, lineHeight: 1.3 }}>{data.question}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.options.map((o, i) => {
          const isPicked = picked === i;
          const isRight = revealed && i === data.correct;
          const isWrong = revealed && isPicked && i !== data.correct;
          let bg = "var(--aura-paper-2)";
          let bd = "var(--aura-line)";
          if (isRight) { bg = "var(--aura-sage-wash)"; bd = "var(--aura-sage)"; }
          else if (isWrong) { bg = "var(--aura-clay-soft)"; bd = "var(--aura-clay)"; }
          else if (isPicked) { bg = "var(--aura-paper)"; bd = "var(--aura-ink-soft)"; }
          return (
            <button
              key={i}
              onClick={() => {
                if (!revealed) {
                  setPicked(i);
                  setRevealed(true);
                  ctx.onAnswer?.(i === data.correct);
                }
              }}
              style={{
                textAlign: "left",
                padding: "14px 18px",
                borderRadius: 12,
                border: `1.5px solid ${bd}`,
                background: bg,
                cursor: revealed ? "default" : "pointer",
                font: "inherit",
                color: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 12,
                transition: "all .2s",
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  background: "var(--aura-paper)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "JetBrains Mono",
                  fontSize: 12,
                  color: "var(--aura-ink-mute)",
                  border: "1px solid var(--aura-line)",
                }}
              >
                {["A", "B", "C", "D"][i]}
              </span>
              <span style={{ flex: 1 }}>{o}</span>
              {isRight && <span style={{ color: "var(--aura-sage-deep)", fontSize: 12, fontWeight: 600 }}>✓ correct</span>}
              {isWrong && <span style={{ color: "var(--aura-clay)", fontSize: 12, fontWeight: 600 }}>not this one</span>}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div
          className="rise"
          style={{
            background: "var(--aura-sage-wash)",
            padding: "14px 18px",
            borderRadius: 12,
            fontSize: 14,
            color: "var(--aura-ink-soft)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--aura-ink)" }}>Why →</strong> {data.explanation}
        </div>
      )}
      {revealed && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn--sage" onClick={ctx.onNext}>Next</button>
        </div>
      )}
    </CardChrome>
  );
}
