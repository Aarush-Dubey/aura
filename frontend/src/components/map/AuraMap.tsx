import type { MapEdge as Edge, MapNode as Node } from "../../api/types";

const stateColors: Record<string, string> = {
  locked: "var(--node-locked)",
  ready: "var(--node-ready)",
  active: "var(--node-active)",
  shaky: "var(--node-shaky)",
  mastered: "var(--node-master)",
  blocked: "var(--node-block)",
  deferred: "var(--node-defer)",
  repair: "var(--node-repair)",
  hidden: "transparent"
};

const edgeColors: Record<string, string> = {
  inactive: "var(--line-2)",
  available: "var(--accent-cyan-2)",
  active: "var(--accent-cyan)",
  completed: "var(--accent-gold)",
  repair: "var(--accent-violet)",
  hidden: "transparent"
};

function MapEdge({ edge, nodes }: { edge: Edge; nodes: Node[] }) {
  const a = nodes.find((node) => node.id === edge.from);
  const b = nodes.find((node) => node.id === edge.to);
  if (!a || !b || edge.state === "hidden") return null;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const norm = Math.sqrt(dx * dx + dy * dy) || 1;
  const d = `M ${a.x} ${a.y} Q ${mx + (-dy / norm) * 18} ${my + (dx / norm) * 18} ${b.x} ${b.y}`;
  const active = edge.state === "active" || edge.state === "repair";
  return (
    <g>
      {active && <path d={d} fill="none" stroke={edgeColors[edge.state]} strokeWidth="7" opacity="0.16" strokeLinecap="round" />}
      <path d={d} fill="none" stroke={edgeColors[edge.state]} strokeWidth={active ? 2.8 : 1.6} strokeDasharray={edge.state === "repair" ? "5 7" : edge.state === "inactive" ? "3 6" : "none"} opacity={edge.state === "inactive" ? 0.45 : 0.92} strokeLinecap="round" />
      {active && (
        <circle r="3.4" fill={edgeColors[edge.state]}>
          <animateMotion dur={edge.state === "repair" ? "2.6s" : "2.1s"} repeatCount="indefinite" path={d} />
        </circle>
      )}
    </g>
  );
}

function BlockNode({ node }: { node: Node }) {
  if (node.state === "hidden") return null;
  const color = stateColors[node.state] || stateColors.locked;
  const boss = node.type === "boss";
  const repair = node.type === "repair";
  const s = boss ? 40 : repair ? 24 : 30;
  const pulse = ["active", "ready", "shaky", "repair"].includes(node.state);
  return (
    <g className={`map-node node-${node.state}`} transform={`translate(${node.x},${node.y})`}>
      {pulse && (
        <ellipse cx="0" cy={s + 5} rx={s + 12} ry={(s + 11) / 2.5} fill={color} opacity="0.2">
          <animate attributeName="opacity" values="0.06;0.30;0.06" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="rx" values={`${s + 6};${s + 17};${s + 6}`} dur="2.6s" repeatCount="indefinite" />
        </ellipse>
      )}
      <path d={`M ${s} ${-s / 3} L ${s} ${s} L 0 ${s + s / 3} L 0 ${s / 2}`} fill={`color-mix(in oklab, ${color} 70%, black 30%)`} opacity={node.state === "locked" ? 0.45 : 0.86} />
      <path d={`M ${-s} ${-s / 3} L 0 ${s / 2} L 0 ${s + s / 3} L ${-s} ${s}`} fill={`color-mix(in oklab, ${color} 85%, black 15%)`} opacity={node.state === "locked" ? 0.5 : 1} />
      <path d={`M 0 ${-s} L ${s} ${-s / 3} L 0 ${s / 2} L ${-s} ${-s / 3} Z`} fill={color} opacity={node.state === "locked" ? 0.55 : 1} />
      <path d={`M 0 ${-s + 6} L ${s - 6} ${-s / 3 + 1} L 0 ${s / 2 - 4} L ${-s + 6} ${-s / 3 + 1} Z`} fill="rgba(255,255,255,0.18)" />
      {node.state === "mastered" && <path d="M -8 -6 L -2 0 L 9 -11" fill="none" stroke="var(--bg-canvas)" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />}
      {node.state === "active" && <circle r="5" cx="0" cy="-4" fill="var(--bg-canvas)"><animate attributeName="r" values="3;6;3" dur="1.8s" repeatCount="indefinite" /></circle>}
      {node.state === "shaky" && <text textAnchor="middle" y="-2" fill="var(--bg-canvas)" fontSize="15" fontWeight="800">!</text>}
      {boss && node.state !== "locked" && <path d="M -10 -8 L 0 -17 L 10 -8 L 7 5 L -7 5 Z" fill="var(--accent-gold)" />}
      <text textAnchor="middle" y={s + s / 3 + 20} fill={node.state === "active" || node.state === "shaky" ? "var(--fg-1)" : "var(--fg-2)"} fontSize="12" fontWeight={node.state === "active" ? "700" : "600"}>
        {node.label.length > 20 ? `${node.label.slice(0, 19)}...` : node.label}
      </text>
    </g>
  );
}

export function AuraMap({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  return (
    <div className="map-wrap">
      <svg viewBox="0 0 1000 520" role="img" aria-label="Adaptive learning map">
        <defs>
          <filter id="softGlow"><feGaussianBlur stdDeviation="4" result="coloredBlur" /><feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <g className="map-grid">
          {Array.from({ length: 12 }).map((_, i) => <path key={i} d={`M ${i * 92} 500 L ${i * 92 + 220} 0`} />)}
        </g>
        {edges.map((edge) => <MapEdge key={`${edge.from}-${edge.to}`} edge={edge} nodes={nodes} />)}
        {nodes.map((node) => <BlockNode key={node.id} node={node} />)}
      </svg>
    </div>
  );
}
