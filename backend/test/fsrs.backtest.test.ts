import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createReviewCard,
  scheduleReview,
  retrievability,
  nextInterval,
  REQUEST_RETENTION,
  type ReviewCard,
  type ReviewRating,
} from "../src/pipeline/spacedReview.js";
import { mulberry32 } from "./_prng.js";

// ---------------------------------------------------------------------------
// FSRS retention backtest
//
// A spaced-repetition scheduler is a model: it claims that if you review a card
// at the interval it prescribes, you will recall it with probability
// REQUEST_RETENTION (0.9). This is the analogue of a pricing model claiming a
// fair value — you validate it by backtesting realized outcomes against the
// prediction, not by eyeballing the formula.
//
// Ground-truth memory here is the scheduler's OWN forgetting curve (same
// family). That makes this a *self-consistency / calibration* backtest: it
// verifies that the interval formula and the retrievability formula agree on
// the 0.9 target, and that realized recall — sampled from the true curve at the
// scheduled due date — matches the predicted recall (reliability-diagram
// calibration). It catches any change that breaks either formula or their
// agreement (e.g. a wrong REQUEST_RETENTION, a broken interval derivation).
//
// It deliberately does NOT claim to validate FSRS against real human memory —
// that needs a held-out human dataset. See ENGINEERING.md.
// ---------------------------------------------------------------------------

type Sample = {
  stabilityBefore: number;
  stateBefore: ReviewCard["state"];
  elapsedDays: number;
  predicted: number; // model's predicted recall probability at review time
  recalled: boolean; // realized outcome drawn from the true curve
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Run a deterministic cohort simulation.
 * Each card is reviewed exactly at its scheduled due date. At that moment the
 * true recall probability equals the scheduler's retrievability at the elapsed
 * time; we draw a Bernoulli outcome and feed a rating back (Good on recall,
 * Again on lapse). Because the clock is driven by a seeded PRNG and fake timers,
 * the whole run is reproducible.
 */
function runCohort(opts: { cards: number; roundsPerCard: number; seed: number }): Sample[] {
  const rng = mulberry32(opts.seed);
  const samples: Sample[] = [];
  const t0 = new Date("2026-01-01T00:00:00.000Z").getTime();

  for (let i = 0; i < opts.cards; i++) {
    let card = createReviewCard("sess", `node_${i}`, "mcq", "front", "back");
    // First exposure: learner sees the card "now". Give a spread of first
    // ratings so the cohort isn't a monoculture.
    vi.setSystemTime(t0);
    const firstRating = (rng() < 0.75 ? 3 : 2) as ReviewRating;
    card = scheduleReview(card, firstRating);

    for (let round = 0; round < opts.roundsPerCard; round++) {
      const dueMs = new Date(card.dueDate).getTime();
      const lastMs = new Date(card.lastReview).getTime();
      const elapsedDays = (dueMs - lastMs) / DAY_MS;

      const predicted = retrievability(elapsedDays, card.stability);
      const recalled = rng() < predicted;

      samples.push({
        stabilityBefore: card.stability,
        stateBefore: card.state,
        elapsedDays,
        predicted,
        recalled,
      });

      // Advance the virtual clock to the due date and apply the outcome.
      vi.setSystemTime(dueMs);
      const rating: ReviewRating = recalled ? 3 : 1;
      card = scheduleReview(card, rating);
    }
  }
  return samples;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

/** Reliability diagram: bin by predicted probability, compare to realized. */
function reliabilityTable(samples: Sample[], bins = 10) {
  const rows: { lo: number; hi: number; n: number; predicted: number; realized: number }[] = [];
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const inBin = samples.filter((s) => s.predicted >= lo && s.predicted < (b === bins - 1 ? hi + 1e-9 : hi));
    if (inBin.length === 0) continue;
    rows.push({
      lo,
      hi,
      n: inBin.length,
      predicted: mean(inBin.map((s) => s.predicted)),
      realized: mean(inBin.map((s) => (s.recalled ? 1 : 0))),
    });
  }
  return rows;
}

describe("FSRS retention backtest", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("nextInterval hits the target retention exactly at maturity (pure-math anchor)", () => {
    // For an integer-day stability, the prescribed interval equals S, and the
    // retrievability at t=S must be exactly REQUEST_RETENTION.
    for (const s of [4, 10, 30, 90, 180]) {
      const i = nextInterval(s);
      const r = retrievability(i, s);
      expect(r).toBeCloseTo(REQUEST_RETENTION, 2);
    }
  });

  it("is well-calibrated: realized recall tracks predicted recall in every populated bin", () => {
    const samples = runCohort({ cards: 400, roundsPerCard: 25, seed: 0xa11ce });
    const table = reliabilityTable(samples);

    // Reliability diagram — printed so the artifact is human-inspectable.
    // eslint-disable-next-line no-console
    console.log("\n  predicted   realized      n   |gap|");
    for (const row of table) {
      const gap = Math.abs(row.realized - row.predicted);
      // eslint-disable-next-line no-console
      console.log(
        `   ${row.predicted.toFixed(3)}      ${row.realized.toFixed(3)}   ${String(row.n).padStart(5)}   ${gap.toFixed(3)}`
      );
    }

    for (const row of table) {
      if (row.n < 200) continue; // ignore sparse bins (sampling noise dominates)
      expect(Math.abs(row.realized - row.predicted)).toBeLessThan(0.05);
    }
  });

  it("holds realized retention near the 0.9 target for mature cards", () => {
    const samples = runCohort({ cards: 400, roundsPerCard: 25, seed: 0xbeef });
    const mature = samples.filter((s) => s.stateBefore === "review" && s.stabilityBefore >= 2);
    expect(mature.length).toBeGreaterThan(500);

    const realized = mean(mature.map((s) => (s.recalled ? 1 : 0)));
    const predicted = mean(mature.map((s) => s.predicted));

    // eslint-disable-next-line no-console
    console.log(`\n  mature cards: n=${mature.length}  predicted=${predicted.toFixed(3)}  realized=${realized.toFixed(3)}`);

    // Rounding intervals to whole days makes the cohort review slightly more
    // often than the continuous optimum. Because the forgetting curve is convex,
    // Jensen's inequality pushes AVERAGE retention a little ABOVE the 0.9 target
    // (a conservative bias — better recall, marginally more reviews). What must
    // hold is that realized tracks predicted: the scheduler is well-calibrated.
    expect(predicted).toBeGreaterThan(0.88);
    expect(predicted).toBeLessThan(0.95);
    expect(Math.abs(realized - predicted)).toBeLessThan(0.02);
  });
});
