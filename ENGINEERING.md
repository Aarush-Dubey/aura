# Engineering Notes

Aura began as a hackathon demo. This document covers the parts that were
hardened into production-quality, testable components — the two pieces of the
system that are pure algorithms rather than glue around a local LLM:

1. the **FSRS-5 spaced-repetition scheduler** (a probabilistic memory model), and
2. the **LLM broker** (a priority scheduler with latency telemetry).

Both are now covered by a deterministic test suite (`backend/test/`), run in CI
on every push. `pnpm --dir backend test` runs everything in ~2s with no network,
no live model, and no wall-clock dependence.

---

## 1. Validating the FSRS scheduler like a model, not a function

A spaced-repetition scheduler makes a falsifiable claim: *if you review a card
at the interval I prescribe, you will recall it with probability
`REQUEST_RETENTION` (0.9).* That is a model prediction, so it is validated the
way you validate a model — with invariants and a backtest — not by reading the
formula and nodding.

### Invariants (`fsrs.unit.test.ts`, `fsrs.properties.test.ts`)

Property-based tests (fast-check) drive fresh cards through thousands of random
rating histories (length up to 60) and assert, after *every* step:

- difficulty stays finite and within the canonical `[1,10]` scale;
- stability stays finite and above the `0.1` floor;
- the interval is a positive integer, and `dueDate > lastReview`;
- `reps` increments by exactly one per review; `lapses` increments **iff** the
  rating is *Again*;
- any non-*Again* rating lands the card in the `review` state;
- scheduling is order-preserving in stability: a card with a flawless recall
  history is never scheduled sooner than a lapse-heavy one.

### Bug found and fixed by these tests

The property tests immediately failed with `RangeError: Invalid time value`.
Root cause: the `difficulty` term was clamped to `[0,1]`, but the FSRS-5
stability equations (`11 - D`, `D^(-w)`) are the canonical ones written for
`D ∈ [1,10]`. When difficulty saturated at 0 (which the initialisation formula
does for *Good*/*Easy* ratings), a subsequent lapse evaluated `0^(-0.05) =
Infinity`, cascading `stability → Infinity → interval → Infinity → Date
overflow`. Fixed by moving difficulty onto the canonical `[1,10]` scale and
adding a 100-year interval cap (matching Anki's default) so no run of perfect
recalls can overflow a date. See `backend/src/pipeline/spacedReview.ts`.

### Retention backtest (`fsrs.backtest.test.ts`)

A deterministic (seeded PRNG + fake timers) cohort of 400 cards is reviewed
exactly at each prescribed due date. At review time the true recall probability
is the scheduler's own retrievability at the elapsed interval; a Bernoulli draw
decides recall, and the outcome is fed back as a rating. We then check
**calibration** — the analogue of a reliability diagram / coverage test:

```
predicted   realized      n   |gap|
  0.794      0.809      89   0.015
  0.897      0.895    3225   0.002
  0.928      0.924    6686   0.004
```

Realized recall tracks predicted recall to within 1.5% in every populated bin.
For mature cards, predicted retention sits at ~0.92 and realized tracks it to
0.002. Note that value is deliberately *above* the 0.9 target: rounding
intervals to whole days makes the cohort review slightly more often than the
continuous optimum, and because the forgetting curve is convex, Jensen's
inequality pushes average retention up — a conservative bias.

**Scope.** This is a *self-consistency* backtest: ground-truth memory is the
scheduler's own forgetting curve, so it validates that the interval formula and
the retrievability formula agree on the target and that realized outcomes are
well-calibrated to predictions. It does **not** claim to validate FSRS against
real human memory — that needs a held-out review-log dataset, which is the
natural next step.

---

## 2. The LLM broker: scheduler correctness + tail latency

One local model serves every agent (curriculum planner, card generator,
evaluator, chat). The broker (`backend/src/llm/broker.ts`) multiplexes them
through a priority queue so a foreground card generation preempts background
prefetch.

### Data structure

The queue was an array re-sorted (`O(n log n)`) on every dequeue. It is now a
reusable **binary min-heap** (`backend/src/util/minHeap.ts`, `O(log n)`
push/pop) ordered by `(priority, sequence)` — strict priority with a FIFO
tie-break inside each priority level.

### Correctness tests (`minHeap.test.ts`, `broker.scheduler.test.ts`)

- The heap drains to the sorted permutation of its input, and preserves the min
  invariant under arbitrary interleaved push/pop sequences (property-based).
- The broker's exact comparator (`compareQueueEntries`, exported for testing)
  reproduces a reference stable sort over random workloads.
- Concrete ordering contracts: foreground work outranks background work; a late
  high-priority job jumps ahead of already-waiting low-priority jobs; FIFO holds
  within a priority level.

### Tail-latency telemetry

Job telemetry previously exposed only the last N raw samples. It now maintains
rolling windows (`backend/src/util/percentile.ts`) and reports **p50/p95/p99**
for both total and queue-wait latency — the percentiles that matter when a
shared resource is under queueing pressure. Verified against known fixtures.

---

## 3. Write atomicity

Advancing a lesson writes three coupled artifacts — knowledge graph, lesson
path, game state. These were three independent statements; a crash or
serialization failure between them left a session in a torn state (an advanced
path pointing at a stale graph). They are now a single atomic unit,
`saveSessionArtifacts` (`backend/src/db/store.ts`), wrapping the writes in a
`better-sqlite3` transaction. `db.transaction.test.ts` verifies that an
injected mid-transaction failure rolls back *every* write, leaving no partial
state.

---

## 4. Input validation at the trust boundary

`cardSchemas.ts` already validated untrusted *model output* with zod. The same
rigor now applies to untrusted *network input*: every mutating route parses its
body through a zod schema (`backend/src/api/validation.ts`) before the handler
runs, so malformed requests fail fast with a `400` + issue list instead of
coercing silently. Covered by `validation.test.ts`.

---

## Running it

```bash
pnpm --dir backend test          # full suite (~2s, no network/model)
pnpm --dir backend test:watch    # watch mode
pnpm --dir backend test:bench    # retention backtest + calibration table
pnpm --dir backend run build     # tsc --noEmit
```

CI (`.github/workflows/ci.yml`) runs the backend typecheck + test suite and a
frontend typecheck on every push and PR.
