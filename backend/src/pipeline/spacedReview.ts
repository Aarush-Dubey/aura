// ---------------------------------------------------------------------------
// FSRS-5 Spaced Repetition Scheduler for Aura
// Pure-function implementation — no DB access, no side effects.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

// ---- Types ----------------------------------------------------------------

export type ReviewRating = 1 | 2 | 3 | 4; // 1=again, 2=hard, 3=good, 4=easy

export type ReviewCard = {
  id: string;           // unique review item ID
  sessionId: string;    // which session this came from
  nodeId: string;       // which knowledge node
  cardType: string;     // original card type (mcq, vocab, etc.)
  front: string;        // question/prompt
  back: string;         // answer
  stability: number;    // FSRS stability (days)
  difficulty: number;   // FSRS difficulty (0–1)
  dueDate: string;      // ISO date string
  lastReview: string;   // ISO date string
  interval: number;     // days until next review
  reps: number;         // total reviews
  lapses: number;       // times forgotten (rated 1)
  state: "new" | "learning" | "review" | "relearning";
};

// ---- Constants ------------------------------------------------------------

export const dailyNewCardLimit = 20;
export const dailyReviewLimit = 100;

// FSRS-5 optimised parameter vector
const w: readonly number[] = [
  0.4,   // w[0]  — S0 for Again
  0.6,   // w[1]  — S0 for Hard
  2.4,   // w[2]  — S0 for Good
  5.8,   // w[3]  — S0 for Easy
  4.93,  // w[4]  — D0 base
  0.94,  // w[5]  — D0 exponential factor
  0.86,  // w[6]  — mean-reversion difficulty factor
  0.01,  // w[7]  — mean-reversion weight
  1.49,  // w[8]  — recall stability multiplier
  0.14,  // w[9]  — recall stability power on D
  0.94,  // w[10] — recall stability power on R
  2.18,  // w[11] — forget stability multiplier
  0.05,  // w[12] — forget stability power on D
  0.34,  // w[13] — forget stability power on S
  1.26,  // w[14] — forget stability power on R
  0.29,  // w[15]
  2.61,  // w[16]
];

const REQUEST_RETENTION = 0.9;
const LN_RETENTION = Math.log(REQUEST_RETENTION); // ln(0.9) ≈ −0.10536

// ---- Helpers --------------------------------------------------------------

/** Clamp a value to [lo, hi]. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Elapsed days between two ISO date strings. */
function elapsedDays(last: string, now: string): number {
  const ms = new Date(now).getTime() - new Date(last).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

/** Compute the next interval (in days) from stability and desired retention. */
function nextInterval(stability: number): number {
  // interval = S * (R^(1/ln(0.9)) − 1)  where we want R = requestRetention
  // Simplifies to: interval = S / factor  where factor = −ln(0.9) / ln(requestRetention)
  // But since requestRetention IS 0.9, interval ≈ S * 1 = S (exactly when R = 0.9).
  // General formula: interval = (S / -ln(0.9)) * ln(requestRetention) ... let's just use
  // the standard FSRS formula: I = S * ( requestRetention^(1/DECAY) - 1 ) / FACTOR
  // FSRS uses DECAY = -0.5, FACTOR = 19/81
  // => I = S * ( 0.9^(-2) - 1 ) / (19/81) = S * (1/0.81 - 1) / (19/81)
  //      = S * (0.19/0.81) / (19/81) = S * (19/81) / (19/81) = S
  // Actually with DECAY=-0.5 & FACTOR=19/81 the retrievability is:
  //   R = (1 + FACTOR * t/S)^DECAY  and solving R=0.9 for t gives t ≈ 9/19 * S * (0.9^(-2)-1)
  // But a simpler & equivalent approach used by many FSRS implementations:
  //   I = 9 * S * (1/requestRetention - 1)
  // With requestRetention = 0.9: I = 9 * S * (1/0.9 - 1) = 9 * S * (1/9) = S.
  // So interval = S days (rounded, minimum 1).
  const interval = 9 * stability * (1 / REQUEST_RETENTION - 1);
  return Math.max(1, Math.round(interval));
}

/** Retrievability: R(t, S) using the power-forgetting-curve form. */
function retrievability(elapsed: number, stability: number): number {
  // FSRS-5 power curve: R = (1 + FACTOR * t/S) ^ DECAY
  // with FACTOR = 19/81, DECAY = -0.5
  const FACTOR = 19 / 81;
  const DECAY = -0.5;
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsed) / stability, DECAY);
}

/** Initial difficulty D0(G) = w[4] - exp(w[5] * (G - 1)) + 1 */
function initialDifficulty(rating: ReviewRating): number {
  const d = w[4] - Math.exp(w[5] * (rating - 1)) + 1;
  return clamp(d, 0, 1);
}

/** Initial stability S0(G) = w[G-1] */
function initialStability(rating: ReviewRating): number {
  return Math.max(0.1, w[rating - 1]);
}

/**
 * Next difficulty after a review.
 * D'(D, G) = w[7] * D0(G) + (1 - w[7]) * (D - w[6] * (G - 3))
 */
function nextDifficulty(d: number, rating: ReviewRating): number {
  const d0 = initialDifficulty(rating);
  const next = w[7] * d0 + (1 - w[7]) * (d - w[6] * (rating - 3));
  return clamp(next, 0, 1);
}

/**
 * Stability after a successful recall.
 * S'_recall = S * (exp(w[8]) * (11 - D) * S^(-w[9]) * (exp(w[10] * (1-R)) - 1) + 1)
 */
function stabilityAfterRecall(s: number, d: number, r: number): number {
  const newS =
    s *
    (Math.exp(w[8]) *
      (11 - d) *
      Math.pow(s, -w[9]) *
      (Math.exp(w[10] * (1 - r)) - 1) +
      1);
  return Math.max(0.1, newS);
}

/**
 * Stability after a lapse (forget).
 * S'_forget = w[11] * D^(-w[12]) * ((S+1)^w[13] - 1) * exp(w[14] * (1-R))
 */
function stabilityAfterForget(s: number, d: number, r: number): number {
  const newS =
    w[11] *
    Math.pow(d, -w[12]) *
    (Math.pow(s + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - r));
  return Math.max(0.1, newS);
}

/** Add `days` to an ISO date string and return a new ISO string. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ---- Public API -----------------------------------------------------------

/**
 * Core FSRS-5 scheduling. Given a card and a rating, returns the updated card
 * with new stability, difficulty, interval, due date, state, reps, and lapses.
 */
export function scheduleReview(card: ReviewCard, rating: ReviewRating): ReviewCard {
  const now = new Date().toISOString();
  const elapsed = card.state === "new" ? 0 : elapsedDays(card.lastReview, now);

  let newStability: number;
  let newDifficulty: number;
  let newState: ReviewCard["state"];
  let newLapses = card.lapses;

  switch (card.state) {
    // ---- New card ----------------------------------------------------------
    case "new": {
      newDifficulty = initialDifficulty(rating);
      newStability = initialStability(rating);

      if (rating === 1) {
        newState = "learning";
        newLapses += 1;
      } else {
        newState = "review";
      }
      break;
    }

    // ---- Learning / Relearning --------------------------------------------
    case "learning":
    case "relearning": {
      newDifficulty = nextDifficulty(card.difficulty, rating);

      if (rating === 1) {
        // Failed again — stay in (re)learning
        newStability = initialStability(rating);
        newState = card.state;
        newLapses += 1;
      } else {
        // Graduated from learning
        newStability = initialStability(rating);
        newState = "review";
      }
      break;
    }

    // ---- Review (graduated card) ------------------------------------------
    case "review": {
      const r = retrievability(elapsed, card.stability);
      newDifficulty = nextDifficulty(card.difficulty, rating);

      if (rating === 1) {
        // Lapse → relearning
        newStability = stabilityAfterForget(card.stability, card.difficulty, r);
        newState = "relearning";
        newLapses += 1;
      } else {
        // Successful recall
        newStability = stabilityAfterRecall(card.stability, card.difficulty, r);
        newState = "review";
      }
      break;
    }

    default: {
      // Should never happen — treat as new
      newDifficulty = initialDifficulty(rating);
      newStability = initialStability(rating);
      newState = "review";
    }
  }

  // Clamp final values
  newStability = Math.max(0.1, newStability);
  newDifficulty = clamp(newDifficulty, 0, 1);

  const interval = nextInterval(newStability);
  const dueDate = addDays(now, interval);

  return {
    ...card,
    stability: newStability,
    difficulty: newDifficulty,
    dueDate,
    lastReview: now,
    interval,
    reps: card.reps + 1,
    lapses: newLapses,
    state: newState,
  };
}

/**
 * Create a brand-new review card with initial FSRS state.
 */
export function createReviewCard(
  sessionId: string,
  nodeId: string,
  cardType: string,
  front: string,
  back: string,
): ReviewCard {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    sessionId,
    nodeId,
    cardType,
    front,
    back,
    stability: 0,
    difficulty: 0,
    dueDate: now, // due immediately (new card)
    lastReview: now,
    interval: 0,
    reps: 0,
    lapses: 0,
    state: "new",
  };
}

/**
 * Returns true if the card is due for review (due date ≤ now).
 */
export function isDue(card: ReviewCard): boolean {
  return new Date(card.dueDate).getTime() <= Date.now();
}

/**
 * Sort cards by review priority:
 *   1. Overdue cards first, ordered by how overdue (most overdue first)
 *   2. New cards
 *   3. Remaining cards ordered by due date (soonest first)
 */
export function sortByPriority(cards: ReviewCard[]): ReviewCard[] {
  const now = Date.now();

  return [...cards].sort((a, b) => {
    const aDue = new Date(a.dueDate).getTime();
    const bDue = new Date(b.dueDate).getTime();
    const aOverdue = aDue <= now;
    const bOverdue = bDue <= now;
    const aNew = a.state === "new";
    const bNew = b.state === "new";

    // 1. Overdue cards first — most overdue (smallest due date) wins
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    if (aOverdue && bOverdue) return aDue - bDue;

    // 2. New cards before non-overdue, non-new cards
    if (aNew && !bNew) return -1;
    if (!aNew && bNew) return 1;

    // 3. By due date ascending
    return aDue - bDue;
  });
}
