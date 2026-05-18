import type { ComponentType } from "react";
import type { LessonCard } from "../../api/types";
import { HearItContext } from "./CardChrome";
import { ConceptCard } from "./types/ConceptCard";
import { VisualCard } from "./types/VisualCard";
import { AnalogyCard } from "./types/AnalogyCard";
import { StoryCard } from "./types/StoryCard";
import { QuizCard } from "./types/QuizCard";
import { RecallCard } from "./types/RecallCard";
import { DragSortCard } from "./types/DragSortCard";
import { FlashCard } from "./types/FlashCard";
import { BreakCard } from "./types/BreakCard";
import { ReflectCard } from "./types/ReflectCard";
import { RepairCard } from "./types/RepairCard";
import { ConnectionCard } from "./types/ConnectionCard";
import { VocabCard } from "./types/VocabCard";
import { RecapCard } from "./types/RecapCard";
import { MorphemeCard } from "./types/MorphemeCard";
import { PhonicsCard } from "./types/PhonicsCard";

export type CardCtx = {
  bionic?: boolean;
  readAloud?: boolean;
  onNext: () => void;
  onAnswer?: (correct: boolean) => void;
  onSlower?: () => void;
  onEnd?: () => void;
  onLoadNextNode?: () => void;
  onHearIt?: () => void;
  hearing?: boolean;
  highlightIndex?: number;
  highlightWords?: string[];
  testMode?: boolean;
};

const REGISTRY: Record<string, ComponentType<{ data: any; ctx: CardCtx }>> = {
  concept: ConceptCard,
  visual: VisualCard,
  analogy: AnalogyCard,
  story: StoryCard,
  quiz: QuizCard,
  recall: RecallCard,
  dragsort: DragSortCard,
  flash: FlashCard,
  break: BreakCard,
  reflect: ReflectCard,
  repair: RepairCard,
  connection: ConnectionCard,
  vocab: VocabCard,
  recap: RecapCard,
  morpheme: MorphemeCard,
  phonics: PhonicsCard,
};

function adaptLegacyCard(card: LessonCard): { type: string; data: any } {
  switch (card.type) {
    case "text_explain":
      return {
        type: "concept",
        data: {
          title: card.title,
          body: card.body.split("\n\n").length > 1 ? card.body.split("\n\n") : [card.body],
          keyTerm: card.emphasis?.[0]
            ? { word: card.emphasis[0], phonetic: "", meaning: "" }
            : undefined,
        },
      };
    case "mcq":
      return {
        type: "quiz",
        data: {
          question: card.prompt,
          options: card.options.map((o) => o.text),
          correct: card.options.findIndex((o) => o.id === card.correctOptionId),
          explanation: card.feedback.correct,
        },
      };
    case "fill_blank":
      return {
        type: "recall",
        data: {
          prompt: `${card.beforeBlank} _____ ${card.afterBlank}`,
          accept: card.acceptedAnswers,
          model: card.acceptedAnswers[0] ?? "",
        },
      };
    case "true_false":
      return {
        type: "quiz",
        data: {
          question: card.statement,
          options: ["True", "False"],
          correct: card.correctAnswer ? 0 : 1,
          explanation: `The statement is ${card.correctAnswer ? "true" : "false"}.`,
        },
      };
    case "recap":
      return {
        type: "recap",
        data: {
          title: card.title,
          bullets: card.bullets,
          tags: (card as any).nextUnlocked ?? [],
        },
      };
    case "repair_card":
      return {
        type: "repair",
        data: {
          observation: card.gentleMessage,
          title: card.title,
          misconception: card.gentleMessage,
          truth: card.correction,
          correction: card.correction,
        },
      };
    default:
      return { type: (card as any).type, data: card };
  }
}

export function resolveCard(card: LessonCard): { type: string; data: any } {
  if (card.type in REGISTRY) {
    return { type: card.type, data: card };
  }
  return adaptLegacyCard(card);
}

export function AuraCard({ card, ctx }: { card: { type: string; data: any }; ctx: CardCtx }) {
  const Comp = REGISTRY[card.type];
  if (!Comp) return null;
  return (
    <HearItContext.Provider value={{ onHearIt: ctx.onHearIt, hearing: ctx.hearing }}>
      <Comp data={card.data} ctx={ctx} />
    </HearItContext.Provider>
  );
}
