import { describe, it, expect } from "vitest";
import {
  createReviewCard,
  scheduleReview,
  isDue,
  sortByPriority,
  type ReviewCard,
  type ReviewRating,
} from "../src/pipeline/spacedReview.js";

function newCard(): ReviewCard {
  return createReviewCard("s1", "n1", "mcq", "front", "back");
}

/** Drive a card through a fixed rating sequence. */
function play(ratings: ReviewRating[], start = newCard()): ReviewCard {
  let card = start;
  for (const r of ratings) card = scheduleReview(card, r);
  return card;
}

describe("createReviewCard", () => {
  it("starts new, due immediately, zeroed stats", () => {
    const c = newCard();
    expect(c.state).toBe("new");
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(0);
    expect(isDue(c)).toBe(true);
  });
});

describe("scheduleReview — state machine", () => {
  it("new + Again → learning + one lapse", () => {
    const c = scheduleReview(newCard(), 1);
    expect(c.state).toBe("learning");
    expect(c.lapses).toBe(1);
    expect(c.reps).toBe(1);
  });

  it("new + Good → review, no lapse", () => {
    const c = scheduleReview(newCard(), 3);
    expect(c.state).toBe("review");
    expect(c.lapses).toBe(0);
  });

  it("review + Again → relearning + lapse", () => {
    const reviewed = play([3]);
    const lapsed = scheduleReview(reviewed, 1);
    expect(lapsed.state).toBe("relearning");
    expect(lapsed.lapses).toBe(1);
  });

  it("any non-Again rating graduates to review", () => {
    for (const r of [2, 3, 4] as ReviewRating[]) {
      expect(scheduleReview(newCard(), r).state).toBe("review");
    }
  });

  it("every review increments reps by exactly one", () => {
    const c = play([3, 3, 1, 3, 2]);
    expect(c.reps).toBe(5);
  });
});

describe("scheduleReview — bounds", () => {
  it("difficulty stays within the canonical [1,10] range across an adversarial sequence", () => {
    // This exact sequence (Easy → difficulty floor, then Again) previously drove
    // difficulty to 0 and made stabilityAfterForget compute 0^(-w) = Infinity.
    const ratings: ReviewRating[] = [1, 4, 1, 1, 4, 2, 3, 1, 4, 4, 1, 2, 3, 3, 1];
    let card = newCard();
    for (const r of ratings) {
      card = scheduleReview(card, r);
      expect(Number.isFinite(card.stability)).toBe(true);
      expect(card.difficulty).toBeGreaterThanOrEqual(1);
      expect(card.difficulty).toBeLessThanOrEqual(10);
    }
  });

  it("stability never drops below the 0.1 floor", () => {
    let card = newCard();
    for (const r of [1, 1, 1, 1, 1, 1] as ReviewRating[]) {
      card = scheduleReview(card, r);
      expect(card.stability).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("interval is a positive integer and dueDate is after lastReview", () => {
    const c = play([3, 3, 4]);
    expect(Number.isInteger(c.interval)).toBe(true);
    expect(c.interval).toBeGreaterThanOrEqual(1);
    expect(new Date(c.dueDate).getTime()).toBeGreaterThan(new Date(c.lastReview).getTime());
  });
});

describe("scheduleReview — monotonicity", () => {
  it("initial stability is non-decreasing in rating (Again ≤ Hard ≤ Good ≤ Easy)", () => {
    const s = ([1, 2, 3, 4] as ReviewRating[]).map((r) => scheduleReview(newCard(), r).stability);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1]);
  });

  it("successful recall never decreases stability", () => {
    let card = play([3]); // now in review
    for (const r of [2, 3, 4] as ReviewRating[]) {
      const before = card.stability;
      const after = scheduleReview({ ...card }, r);
      expect(after.stability).toBeGreaterThanOrEqual(before - 1e-9);
    }
  });

  it("a lapse (Again) always increments the lapse counter; recall never does", () => {
    let card = newCard();
    let expectedLapses = 0;
    for (const r of [3, 1, 3, 4, 1, 2, 1] as ReviewRating[]) {
      const before = card.lapses;
      card = scheduleReview(card, r);
      if (r === 1) expectedLapses += 1;
      expect(card.lapses).toBe(expectedLapses);
      if (r !== 1) expect(card.lapses).toBe(before);
    }
  });
});

describe("sortByPriority", () => {
  it("orders overdue-first, then new, then by soonest due", () => {
    const base = newCard();
    const overdue: ReviewCard = { ...base, id: "overdue", state: "review", dueDate: new Date(Date.now() - 5 * 864e5).toISOString() };
    const brandNew: ReviewCard = { ...base, id: "new", state: "new", dueDate: new Date(Date.now() - 100).toISOString() };
    const future: ReviewCard = { ...base, id: "future", state: "review", dueDate: new Date(Date.now() + 5 * 864e5).toISOString() };
    const order = sortByPriority([future, brandNew, overdue]).map((c) => c.id);
    expect(order[0]).toBe("overdue");
    expect(order[order.length - 1]).toBe("future");
  });
});
