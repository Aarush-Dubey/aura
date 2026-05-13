import React, { type ReactNode } from "react";

function Bionic({ text }: { text: string }) {
  const parts = text.split(/(\s+)/);
  return (
    <span className="bionic">
      {parts.map((w, i) => {
        if (/^\s+$/.test(w) || w.length === 0) return <span key={i}>{w}</span>;
        const cut = Math.max(1, Math.ceil(w.length * 0.42));
        return (
          <span key={i}>
            <b>{w.slice(0, cut)}</b>
            {w.slice(cut)}
          </span>
        );
      })}
    </span>
  );
}

function walk(node: ReactNode): ReactNode {
  if (typeof node === "string") return <Bionic text={node} />;
  if (Array.isArray(node))
    return node.map((n, i) => <React.Fragment key={i}>{walk(n)}</React.Fragment>);
  if (React.isValidElement(node)) {
    return React.cloneElement(
      node,
      {},
      walk((node.props as { children?: ReactNode }).children)
    );
  }
  return node;
}

export function Reading({ children, bionic }: { children: ReactNode; bionic?: boolean }) {
  if (!bionic) return <div className="reading">{children}</div>;
  return <div className="reading">{walk(children)}</div>;
}

export function SpeakIndicator({ on }: { on?: boolean }) {
  if (!on) return null;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: "var(--aura-ink-mute)",
        marginTop: 8,
      }}
    >
      <span style={{ display: "inline-flex", gap: 2, alignItems: "flex-end", height: 14 }}>
        {[6, 12, 8, 14, 10].map((h, i) => (
          <span
            key={i}
            style={{
              width: 3,
              height: h,
              background: "var(--aura-sage)",
              borderRadius: 2,
              animation: `aura-breath ${0.8 + i * 0.15}s ease-in-out ${i * 0.1}s infinite`,
            }}
          />
        ))}
      </span>
      reading aloud
    </div>
  );
}
