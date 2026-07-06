// ---------------------------------------------------------------------------
// Binary min-heap — O(log n) push/pop priority queue.
//
// Replaces the broker's previous "push + full array sort on every dequeue"
// approach (O(n log n) per pop). Ordering is defined entirely by the `less`
// comparator, so callers get a stable tie-break by threading a sequence number
// (or timestamp) into it.
// ---------------------------------------------------------------------------

export class MinHeap<T> {
  private readonly data: T[] = [];

  /** @param less strict weak ordering: true iff `a` should come out before `b`. */
  constructor(private readonly less: (a: T, b: T) => boolean) {}

  get size(): number {
    return this.data.length;
  }

  isEmpty(): boolean {
    return this.data.length === 0;
  }

  /** The next item without removing it, or undefined if empty. */
  peek(): T | undefined {
    return this.data[0];
  }

  push(item: T): void {
    this.data.push(item);
    this.siftUp(this.data.length - 1);
  }

  /** Remove and return the min item, or undefined if empty. */
  pop(): T | undefined {
    const data = this.data;
    if (data.length === 0) return undefined;
    const top = data[0];
    const last = data.pop() as T;
    if (data.length > 0) {
      data[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  /** Shallow copy of the backing array (heap order, not sorted). */
  toArray(): T[] {
    return this.data.slice();
  }

  /** Items in pop order, without mutating the heap. */
  toSortedArray(): T[] {
    return this.data.slice().sort((a, b) => (this.less(a, b) ? -1 : this.less(b, a) ? 1 : 0));
  }

  private siftUp(i: number): void {
    const data = this.data;
    const item = data[i];
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(item, data[parent])) break;
      data[i] = data[parent];
      i = parent;
    }
    data[i] = item;
  }

  private siftDown(i: number): void {
    const data = this.data;
    const n = data.length;
    const item = data[i];
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.less(data[left], data[smallest])) smallest = left;
      if (right < n && this.less(data[right], data[smallest])) smallest = right;
      if (smallest === i) break;
      data[i] = data[smallest];
      data[smallest] = item;
      i = smallest;
    }
  }
}
