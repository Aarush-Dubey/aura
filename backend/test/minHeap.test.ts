import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { MinHeap } from "../src/util/minHeap.js";

const numHeap = () => new MinHeap<number>((a, b) => a < b);

describe("MinHeap", () => {
  it("peek/pop return ascending order for a fixed input", () => {
    const h = numHeap();
    [5, 3, 8, 1, 9, 2, 7].forEach((n) => h.push(n));
    expect(h.peek()).toBe(1);
    const out: number[] = [];
    while (!h.isEmpty()) out.push(h.pop()!);
    expect(out).toEqual([1, 2, 3, 5, 7, 8, 9]);
  });

  it("pop on empty returns undefined and size stays 0", () => {
    const h = numHeap();
    expect(h.pop()).toBeUndefined();
    expect(h.size).toBe(0);
  });

  it("draining always yields the sorted permutation (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 200 }), (xs) => {
        const h = numHeap();
        xs.forEach((x) => h.push(x));
        const out: number[] = [];
        while (!h.isEmpty()) out.push(h.pop()!);
        expect(out).toEqual([...xs].sort((a, b) => a - b));
      })
    );
  });

  it("interleaved push/pop keeps the min invariant (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.integer({ min: 0, max: 1000 }), fc.constant("pop" as const)), { maxLength: 300 }),
        (ops) => {
          const h = numHeap();
          const ref: number[] = [];
          for (const op of ops) {
            if (op === "pop") {
              ref.sort((a, b) => a - b);
              expect(h.pop()).toBe(ref.shift());
            } else {
              h.push(op);
              ref.push(op);
            }
            expect(h.size).toBe(ref.length);
          }
        }
      )
    );
  });
});
