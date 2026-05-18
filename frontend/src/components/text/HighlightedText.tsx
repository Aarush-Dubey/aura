type Props = {
  text: string;
  highlightIndex: number;
  words: string[];
  active: boolean;
};

export function HighlightedText({ text, highlightIndex, words, active }: Props) {
  if (!active || words.length === 0 || highlightIndex < 0) {
    return <span>{text}</span>;
  }

  return (
    <span>
      {words.map((word, i) => (
        <span key={i}>
          <span
            style={{
              background: i === highlightIndex ? "var(--aura-sage-wash)" : "transparent",
              borderRadius: i === highlightIndex ? 3 : 0,
              padding: i === highlightIndex ? "1px 2px" : 0,
              transition: "background .1s",
            }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
