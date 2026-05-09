import katex from "katex";

type Props = {
  text: string;
  block?: boolean;
};

const mathPattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g;

function renderMath(source: string, displayMode: boolean) {
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: false
    });
  } catch {
    return "";
  }
}

function unwrapMath(token: string) {
  if (token.startsWith("$$") && token.endsWith("$$")) return { source: token.slice(2, -2), displayMode: true };
  if (token.startsWith("\\[") && token.endsWith("\\]")) return { source: token.slice(2, -2), displayMode: true };
  if (token.startsWith("\\(") && token.endsWith("\\)")) return { source: token.slice(2, -2), displayMode: false };
  if (token.startsWith("$") && token.endsWith("$")) return { source: token.slice(1, -1), displayMode: false };
  return null;
}

export function LatexText({ text, block = false }: Props) {
  const parts = text.split(mathPattern).filter(Boolean);
  const Wrapper = block ? "div" : "span";

  return (
    <Wrapper className={block ? "latex-text latex-block-text" : "latex-text"}>
      {parts.map((part, index) => {
        const math = unwrapMath(part);
        if (!math) return <span key={`${part}-${index}`}>{part}</span>;
        const html = renderMath(math.source, math.displayMode);
        if (!html) return <code key={`${part}-${index}`}>{part}</code>;
        return <span key={`${part}-${index}`} className={math.displayMode ? "latex-display" : "latex-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </Wrapper>
  );
}
