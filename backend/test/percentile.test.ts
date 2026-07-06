import { describe, it, expect } from "vitest";
import { percentile, RollingWindow } from "../src/util/percentile.js";

describe("percentile (nearest-rank)", () => {
  it("returns 0 for an empty sample", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("computes p50/p95/p99 on 1..100", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 95)).toBe(95);
    expect(percentile(xs, 99)).toBe(99);
    expect(percentile(xs, 100)).toBe(100);
  });

  it("is order-independent", () => {
    const xs = [9, 1, 5, 3, 7];
    const shuffled = [3, 7, 1, 9, 5];
    expect(percentile(xs, 50)).toBe(percentile(shuffled, 50));
  });
});

describe("RollingWindow", () => {
  it("evicts oldest beyond capacity and reflects only recent samples", () => {
    const w = new RollingWindow(3);
    [10, 20, 30, 40, 50].forEach((v) => w.add(v));
    expect(w.size).toBe(3);
    expect(w.values().slice().sort((a, b) => a - b)).toEqual([30, 40, 50]);
  });

  it("reports percentiles over the retained window", () => {
    const w = new RollingWindow(100);
    for (let i = 1; i <= 100; i++) w.add(i);
    const p = w.percentiles([50, 95, 99]);
    expect(p.p50).toBe(50);
    expect(p.p95).toBe(95);
    expect(p.p99).toBe(99);
  });
});
