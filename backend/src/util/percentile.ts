// Nearest-rank percentile over a numeric sample. Used for broker latency
// telemetry (p50/p95/p99). Returns 0 for an empty sample.
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

/** A fixed-capacity ring buffer of recent samples for rolling percentiles. */
export class RollingWindow {
  private readonly buf: number[] = [];
  private cursor = 0;

  constructor(private readonly capacity: number) {}

  add(value: number): void {
    if (this.buf.length < this.capacity) {
      this.buf.push(value);
    } else {
      this.buf[this.cursor] = value;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
  }

  get size(): number {
    return this.buf.length;
  }

  values(): number[] {
    return this.buf.slice();
  }

  percentiles(ps: number[]): Record<string, number> {
    const snapshot = this.buf.slice();
    const out: Record<string, number> = {};
    for (const p of ps) out[`p${p}`] = percentile(snapshot, p);
    return out;
  }
}
