import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Part = { id: string; name: string; role: string };
type Data = {
  title: string;
  diagram?: string;
  parts: Part[];
};

function CPUDiagram({ hovered, setHovered }: { hovered: string | null; setHovered: (id: string | null) => void }) {
  const part = (id: string, x: number, y: number, w: number, h: number, label: string) => {
    const active = hovered === id;
    return (
      <g key={id} onMouseEnter={() => setHovered(id)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
        <rect x={x} y={y} width={w} height={h} rx={6} fill={active ? "#d3e0e9" : "#eef2ed"} stroke={active ? "#5a7d92" : "#c8d4cb"} strokeWidth="1.2" />
        <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fill="#3b3a36" fontFamily="Lexend">{label}</text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 560 220" style={{ width: "100%", height: 220, background: "var(--aura-paper-2)", borderRadius: 14, border: "1px solid var(--aura-line-soft)" }}>
      <rect x={20} y={20} width={520} height={180} rx={10} fill="none" stroke="#a89b87" strokeDasharray="4 3" />
      <text x={30} y={36} fontSize="10" fontFamily="JetBrains Mono" fill="#8a7d6c">CPU</text>
      {part("cu", 50, 60, 120, 50, "Control Unit")}
      {part("alu", 50, 130, 120, 50, "ALU")}
      {part("reg", 200, 60, 130, 120, "Registers")}
      {part("cache", 360, 60, 160, 50, "L1 / L2 Cache")}
      {part("clock", 360, 130, 160, 50, "Clock")}
      <path d="M170 85 L200 85" stroke="#6b9e7e" strokeWidth="1.5" markerEnd="url(#arrow)" fill="none" />
      <path d="M170 155 L200 155" stroke="#6b9e7e" strokeWidth="1.5" markerEnd="url(#arrow)" fill="none" />
      <path d="M330 120 L360 90" stroke="#6b9e7e" strokeWidth="1.5" markerEnd="url(#arrow)" fill="none" />
      <path d="M330 120 L360 155" stroke="#6b9e7e" strokeWidth="1.5" markerEnd="url(#arrow)" fill="none" />
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="#6b9e7e" />
        </marker>
      </defs>
    </svg>
  );
}

export function VisualCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <CardChrome tone="sky" label={t('visual')} sub={t('visualSub')}>
      <h2 className="title" style={{ fontSize: 28, margin: 0 }}>{data.title}</h2>
      {data.diagram === "cpu" && <CPUDiagram hovered={hovered} setHovered={setHovered} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, fontSize: 14 }}>
        {data.parts.map((p) => (
          <button
            key={p.id}
            onMouseEnter={() => setHovered(p.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              textAlign: "left", padding: "10px 14px", borderRadius: 10,
              border: "1px solid var(--aura-line)",
              background: hovered === p.id ? "var(--aura-sky-wash)" : "var(--aura-paper-2)",
              cursor: "pointer", fontFamily: "inherit", color: "inherit", transition: "background .15s",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
            <div style={{ color: "var(--aura-ink-soft)", fontSize: 12 }}>{p.role}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="btn btn--sage" onClick={ctx.onNext}>{t('common:continue')}</button>
      </div>
    </CardChrome>
  );
}
