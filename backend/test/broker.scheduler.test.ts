import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { MinHeap } from "../src/util/minHeap.js";
import { compareQueueEntries, priorityFor, type LLMJobType } from "../src/llm/broker.js";

type Entry = { priority: number; seq: number; id: string };

function drain(entries: Entry[]): string[] {
  const heap = new MinHeap<Entry>(compareQueueEntries);
  entries.forEach((e) => heap.push(e));
  const out: string[] = [];
  while (!heap.isEmpty()) out.push(heap.pop()!.id);
  return out;
}

describe("broker priority table", () => {
  it("orders foreground work ahead of background work", () => {
    const order: LLMJobType[] = [
      "chat_reply",
      "answer_tool_call",
      "current_card",
      "graph_plan",
      "prefetch_card",
      "polish",
      "health_probe",
    ];
    const priorities = order.map(priorityFor);
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]).toBeGreaterThan(priorities[i - 1]);
    }
  });

  it("a foreground card always outranks a background prefetch", () => {
    expect(priorityFor("current_card")).toBeLessThan(priorityFor("prefetch_node"));
    expect(priorityFor("chat_reply")).toBeLessThan(priorityFor("current_card"));
  });
});

describe("broker scheduling order (strict priority, FIFO tie-break)", () => {
  it("dequeues strictly by priority regardless of enqueue order", () => {
    const entries: Entry[] = [
      { priority: 5, seq: 1, id: "prefetch" },
      { priority: 0, seq: 2, id: "chat" },
      { priority: 2, seq: 3, id: "card" },
    ];
    expect(drain(entries)).toEqual(["chat", "card", "prefetch"]);
  });

  it("preserves FIFO order within the same priority level", () => {
    const entries: Entry[] = [
      { priority: 2, seq: 10, id: "first" },
      { priority: 2, seq: 11, id: "second" },
      { priority: 2, seq: 12, id: "third" },
    ];
    expect(drain(entries)).toEqual(["first", "second", "third"]);
  });

  it("a late high-priority job jumps ahead of waiting low-priority jobs", () => {
    // Two background prefetches are already waiting; a chat reply arrives last.
    const entries: Entry[] = [
      { priority: 5, seq: 1, id: "prefetch_a" },
      { priority: 5, seq: 2, id: "prefetch_b" },
      { priority: 0, seq: 3, id: "chat_late" },
    ];
    expect(drain(entries)[0]).toBe("chat_late");
  });

  it("matches a reference stable sort for arbitrary workloads (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ priority: fc.integer({ min: 0, max: 9 }) }), { maxLength: 200 }),
        (raw) => {
          const entries: Entry[] = raw.map((r, i) => ({ priority: r.priority, seq: i, id: `j${i}` }));
          const reference = [...entries]
            .sort((a, b) => a.priority - b.priority || a.seq - b.seq)
            .map((e) => e.id);
          expect(drain(entries)).toEqual(reference);
        }
      )
    );
  });
});
