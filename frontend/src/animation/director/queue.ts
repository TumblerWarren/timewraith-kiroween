import type { Priority } from "./types";

export interface QueueItem {
  readonly ticket: number;
  readonly key: string;
  readonly priority: Priority;
}

/**
 * Waiting requests, ordered by priority (P0 first) and FIFO among equal priority.
 * Tickets grow monotonically, so FIFO order is ticket order.
 */
export class RequestQueue<T extends QueueItem> {
  private items: T[] = [];

  get size(): number {
    return this.items.length;
  }

  add(item: T): void {
    this.items.push(item);
  }

  remove(ticket: number): T | undefined {
    const i = this.items.findIndex((q) => q.ticket === ticket);
    if (i < 0) return undefined;
    const [item] = this.items.splice(i, 1);
    return item;
  }

  has(ticket: number): boolean {
    return this.items.some((q) => q.ticket === ticket);
  }

  hasKey(key: string): boolean {
    return this.items.some((q) => q.key === key);
  }

  /** A copy in drain order. */
  ordered(): T[] {
    return [...this.items].sort((a, b) => a.priority - b.priority || a.ticket - b.ticket);
  }

  clear(): T[] {
    const all = this.ordered();
    this.items = [];
    return all;
  }
}
