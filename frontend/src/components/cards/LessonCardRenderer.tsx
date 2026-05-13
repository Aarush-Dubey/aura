import { useState } from "react";
import { Check, Lightbulb, RotateCcw, Send } from "lucide-react";
import type { LessonCard } from "../../api/types";
import { LatexText } from "./LatexText";

type Props = {
  card: LessonCard;
  onAnswer: (value: string) => void;
  busy: boolean;
  cardIndex: number;
  cardCount: number;
  onContinue: () => void;
};

export function LessonCardRenderer({ card, onAnswer, busy, cardIndex, cardCount, onContinue }: Props) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const canContinue = cardIndex < cardCount - 1;
  const progressLabel = `Card ${cardIndex + 1} of ${cardCount}`;

  if (card.type === "text_explain") {
    return (
      <section className="lesson-card">
        <div className="card-topline">
          <div className="card-kicker">{card.title.toLowerCase().startsWith("lecture") ? "Lecture" : card.title.toLowerCase().startsWith("worked") ? "Worked example" : "Node detail"}</div>
          <span>{progressLabel}</span>
        </div>
        <h2><LatexText text={card.title} /></h2>
        {card.body.split("\n").filter(Boolean).map((line) => <p key={line}><LatexText text={line} /></p>)}
        {card.emphasis?.length ? <div className="chips">{card.emphasis.map((term) => <span key={term}><LatexText text={term} /></span>)}</div> : null}
        {canContinue ? <button className="primary-action continue-action" onClick={onContinue}>Done</button> : null}
      </section>
    );
  }

  if (card.type === "mcq") {
    const selected = card.options.find((option) => option.id === selectedOptionId);
    const answered = Boolean(selectedOptionId);
    const correct = selectedOptionId === card.correctOptionId;
    const shouldAdvance = card.phase === "exit" || !card.phase;
    const kicker = card.phase === "entry" ? "Entry question" : card.phase === "reflect" ? "Reflection check" : "Exit question";
    return (
      <section className="lesson-card check-card">
        <div className="card-topline">
          <div className="card-kicker">{kicker}</div>
          <span>{progressLabel}</span>
        </div>
        <h2><LatexText text={card.prompt} /></h2>
        <div className="option-stack">
          {card.options.map((option) => (
            <button
              key={option.id}
              disabled={busy || (answered && shouldAdvance)}
              onClick={() => {
                setSelectedOptionId(option.id);
                if (shouldAdvance) onAnswer(option.text);
              }}
              className={`option-button ${selectedOptionId === option.id ? "selected" : ""} ${answered && option.id === card.correctOptionId ? "correct" : ""}`}
            >
              <span><LatexText text={option.text} /></span>
              {answered && option.id === card.correctOptionId ? <Check size={16} /> : <Send size={15} />}
            </button>
          ))}
        </div>
        {answered && !shouldAdvance ? (
          <div className={correct ? "inline-feedback correct" : "inline-feedback"}>
            <LatexText text={correct ? card.feedback.correct : card.feedback.incorrectGeneric} />
          </div>
        ) : null}
        {answered && shouldAdvance && selected ? (
          <div className={correct ? "inline-feedback correct" : "inline-feedback"}>
            <LatexText text={correct ? card.feedback.correct : card.feedback.incorrectGeneric} />
          </div>
        ) : null}
        {answered && !shouldAdvance && canContinue ? <button className="primary-action continue-action" onClick={onContinue}>Done</button> : null}
      </section>
    );
  }

  if (card.type === "repair_card") {
    return (
      <section className="lesson-card repair-card">
        <div className="card-topline">
          <div className="card-kicker"><RotateCcw size={14} /> Support path</div>
          <span>{progressLabel}</span>
        </div>
        <h2><LatexText text={card.title} /></h2>
        <p><LatexText text={card.gentleMessage} /></p>
        <p><LatexText text={card.correction} /></p>
        <button disabled={busy} className="primary-action" onClick={() => onAnswer("This example helps. I can try again.")}>Try the block again</button>
      </section>
    );
  }

  if (card.type === "fill_blank") {
    return (
      <section className="lesson-card check-card">
        <div className="card-topline">
          <div className="card-kicker">One word check</div>
          <span>{progressLabel}</span>
        </div>
        <h2><LatexText text={card.prompt} /></h2>
        <p><LatexText text={`${card.beforeBlank} ____ ${card.afterBlank}`} /></p>
        <button disabled={busy} className="primary-action" onClick={() => onAnswer(card.acceptedAnswers[0] ?? "answer")}>Fill it gently</button>
      </section>
    );
  }

  if (card.type === "true_false") {
    return (
      <section className="lesson-card check-card">
        <div className="card-topline">
          <div className="card-kicker">Tiny decision</div>
          <span>{progressLabel}</span>
        </div>
        <h2><LatexText text={card.statement} /></h2>
        <div className="split-actions">
          <button disabled={busy} onClick={() => onAnswer("true")}>True</button>
          <button disabled={busy} onClick={() => onAnswer("false")}>False</button>
        </div>
      </section>
    );
  }

  if (card.type === "recap") {
    return (
      <section className="lesson-card">
        <div className="card-topline">
          <div className="card-kicker"><Lightbulb size={14} /> Recap</div>
          <span>{progressLabel}</span>
        </div>
        <h2><LatexText text={card.title} /></h2>
        <ul>{card.bullets.map((bullet: string) => <li key={bullet}><LatexText text={bullet} /></li>)}</ul>
        {canContinue ? <button className="primary-action continue-action" onClick={onContinue}>Done</button> : null}
      </section>
    );
  }

  return (
    <section className="lesson-card">
      <div className="card-topline">
        <div className="card-kicker">Card</div>
        <span>{progressLabel}</span>
      </div>
      <p>{"title" in card ? String((card as Record<string, unknown>).title) : card.type}</p>
      {canContinue ? <button className="primary-action continue-action" onClick={onContinue}>Done</button> : null}
    </section>
  );
}
