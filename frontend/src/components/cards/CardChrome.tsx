import { createContext, useContext, type ReactNode } from "react";

type HearItCtx = {
  onHearIt?: () => void;
  hearing?: boolean;
};

export const HearItContext = createContext<HearItCtx>({});

type Props = {
  tone: "sage" | "peach" | "amber" | "sky" | "clay";
  label: string;
  sub?: string;
  accent?: string;
  children: ReactNode;
};

export function CardChrome({ tone, label, sub, accent, children }: Props) {
  const { onHearIt, hearing } = useContext(HearItContext);

  return (
    <div
      className="card rise"
      style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
    >
      <div
        className="card-pad-lg"
        style={{ display: "flex", flexDirection: "column", gap: 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="chip" data-tone={tone}>
            <span className="dot" />
            {label}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {sub && <span style={{ fontSize: 12, color: "var(--aura-ink-mute)" }}>{sub}</span>}
            {onHearIt && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onHearIt();
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: `1px solid ${hearing ? "var(--aura-sage)" : "var(--aura-line)"}`,
                  background: hearing ? "var(--aura-sage-wash)" : "var(--aura-paper-2)",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 11,
                  fontWeight: 500,
                  color: hearing ? "var(--aura-sage-deep)" : "var(--aura-ink-mute)",
                  letterSpacing: ".04em",
                  transition: "all .2s",
                }}
              >
                {hearing ? (
                  <>
                    <span style={{ display: "inline-flex", gap: 2, alignItems: "flex-end", height: 10 }}>
                      {[4, 8, 5, 9, 6].map((h, i) => (
                        <span key={i} style={{ width: 2, height: h, background: "var(--aura-sage)", borderRadius: 1, animation: `aura-breath ${0.8 + i * 0.15}s ease-in-out ${i * 0.1}s infinite` }} />
                      ))}
                    </span>
                    Stop
                  </>
                ) : (
                  "Hear it"
                )}
              </button>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
