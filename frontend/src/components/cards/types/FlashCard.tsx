import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardChrome } from "../CardChrome";
import type { CardCtx } from "../CardRegistry";

type Data = {
  cards: { front: string; back: string }[];
};

export function FlashCard({ data, ctx }: { data: Data; ctx: CardCtx }) {
  const { t } = useTranslation("cards");
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = data.cards[i];

  const next = (rating: string) => {
    ctx.onAnswer?.(rating === "easy" || rating === "good");
    if (i + 1 < data.cards.length) {
      setI(i + 1);
      setFlipped(false);
    } else {
      ctx.onNext();
    }
  };

  return (
    <CardChrome tone="sky" label={t('flashcards')} sub={`${i + 1} / ${data.cards.length}`}>
      <div
        onClick={() => setFlipped((f) => !f)}
        style={{
          minHeight: 200,
          borderRadius: 18,
          padding: "40px 30px",
          background: flipped ? "var(--aura-sky-wash)" : "var(--aura-paper-2)",
          border: "1px solid var(--aura-line)",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          textAlign: "center",
          transition: "background .3s",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--aura-ink-mute)" }}>
          {flipped ? t('definition') : t('term')}
        </div>
        <div style={{ fontSize: flipped ? 18 : 30, fontWeight: flipped ? 400 : 500, lineHeight: 1.4, maxWidth: "42ch" }}>
          {flipped ? card.back : card.front}
        </div>
        {!flipped && <div style={{ fontSize: 12, color: "var(--aura-ink-mute)" }}>{t('tapToReveal')}</div>}
      </div>
      {flipped && (
        <div className="rise" style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn--ghost" onClick={() => next("again")}>{t('again')}</button>
          <button className="btn btn--ghost" onClick={() => next("hard")}>{t('hard')}</button>
          <button className="btn btn--sage" onClick={() => next("good")}>{t('good')}</button>
          <button className="btn btn--sage" onClick={() => next("easy")}>{t('easy')}</button>
        </div>
      )}
    </CardChrome>
  );
}
