import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  createReviewCard,
  scheduleReview,
  type ReviewCard,
  type ReviewRating,
} from "../src/pipeline/spacedReview.js";

// A rating is one of 1..4.
const ratingArb = fc.integer({ min: 1, max: 4 }) as fc.Arbitrary<ReviewRating>;
// A review history is an arbitrary, possibly-long sequence of ratings.
const historyArb = fc.array(ratingArb, { minLength: 1, maxLength: 60 });

/** Replay a rating history from a fresh card, checking an invariant after every step. */
function replay(history: ReviewRating[], check: (c: ReviewCard, prev: ReviewCard) => void) {
  let prev = createReviewCard("s", "n", "mcq", "f", "b");
  let card = prev;
  for (const r of history) {
    card = scheduleReview(prev, r);
    check(card, prev);
    prev = card;
  }
}

describe("FSRS invariants (property-based)", () => {
  it("difficulty is always a finite number on the canonical [1,10] scale", () => {
    fc.assert(
      fc.property(historyArb, (history) => {
        replay(history, (c) => {
          expect(Number.isFinite(c.difficulty)).toBe(true);
          expect(c.difficulty).toBeGreaterThanOrEqual(1);
          expect(c.difficulty).toBeLessThanOrEqual(10);
        });
      })
    );
  });

  it("stability is always finite and ≥ 0.1", () => {
    fc.assert(
      fc.property(historyArb, (history) => {
        replay(history, (c) => {
          expect(Number.isFinite(c.stability)).toBe(true);
          expect(c.stability).toBeGreaterThanOrEqual(0.1);
        });
      })
    );
  });

  it("interval is a positive integer for every scheduled card", () => {
    fc.assert(
      fc.property(historyArb, (history) => {
        replay(history, (c) => {
          expect(Number.isInteger(c.interval)).toBe(true);
          expect(c.interval).toBeGreaterThanOrEqual(1);
        });
      })
    );
  });

  it("reps strictly increases by one per review; lapses increases iff rating is Again", () => {
    fc.assert(
      fc.property(historyArb, (history) => {
        let prev = createReviewCard("s", "n", "mcq", "f", "b");
        let card = prev;
        for (const r of history) {
          card = scheduleReview(prev, r);
          expect(card.reps).toBe(prev.reps + 1);
          expect(card.lapses).toBe(prev.lapses + (r === 1 ? 1 : 0));
          prev = card;
        }
      })
    );
  });

  it("from any history, a subsequent non-Again rating lands in the 'review' state", () => {
    fc.assert(
      fc.property(historyArb, ratingArb.filter((r) => r !== 1), (history, goodRating) => {
        let card = createReviewCard("s", "n", "mcq", "f", "b");
        for (const r of history) card = scheduleReview(card, r);
        const graduated = scheduleReview(card, goodRating);
        expect(graduated.state).toBe("review");
      })
    );
  });

  it("dueDate is always strictly after lastReview", () => {
    fc.assert(
      fc.property(historyArb, (history) => {
        replay(history, (c) => {
          expect(new Date(c.dueDate).getTime()).toBeGreaterThan(new Date(c.lastReview).getTime());
        });
      })
    );
  });

  it("higher stability never yields a shorter interval (scheduling is order-preserving in S)", () => {
    // Reaching high stability requires a run of easy recalls; a lapse-heavy
    // history keeps stability low. The all-Easy card must never be scheduled
    // sooner than the lapse-heavy card of equal length.
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 30 }), (n) => {
        let strong = createReviewCard("s", "n", "mcq", "f", "b");
        let weak = createReviewCard("s", "n", "mcq", "f", "b");
        for (let i = 0; i < n; i++) {
          strong = scheduleReview(strong, 4); // Easy every time
          weak = scheduleReview(weak, i % 2 === 0 ? 1 : 2); // Again/Hard churn
        }
        expect(strong.stability).toBeGreaterThanOrEqual(weak.stability);
        expect(strong.interval).toBeGreaterThanOrEqual(weak.interval);
      })
    );
  });
});
