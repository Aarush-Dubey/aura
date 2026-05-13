import type { ReactNode } from "react";

export function ScreenShell({ children, pad = true }: { children: ReactNode; pad?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        background: "var(--aura-bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: pad ? "center" : "stretch",
        justifyContent: pad ? "flex-start" : "stretch",
        padding: pad ? "60px 40px" : 0,
      }}
    >
      {children}
    </div>
  );
}
