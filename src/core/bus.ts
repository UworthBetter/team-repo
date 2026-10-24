import type { EventName, Events } from '@contracts/events';

type Handler<K extends EventName> = (payload: Events[K]) => void;

export interface LogEntry {
  t: number;
  name: EventName;
  payload: unknown;
}

/**
 * Typed event bus. A handler that throws is logged and skipped, so one broken
 * module never stops the others from hearing an event.
 */
export class Bus {
  private handlers = new Map<EventName, Set<Handler<EventName>>>();
  private anyHandlers = new Set<(e: LogEntry) => void>();
  /** Last 400 events, newest last. Exposed as window.__sizzle.log for debugging and smoke tests. */
  readonly log: LogEntry[] = [];

  on<K extends EventName>(name: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn as Handler<EventName>);
    return () => set!.delete(fn as Handler<EventName>);
  }

  once<K extends EventName>(name: K, fn: Handler<K>): () => void {
    const off = this.on(name, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  onAny(fn: (e: LogEntry) => void): () => void {
    this.anyHandlers.add(fn);
    return () => this.anyHandlers.delete(fn);
  }

  emit<K extends EventName>(name: K, payload: Events[K]): void {
    const entry: LogEntry = { t: Math.round(performance.now()), name, payload };
    this.log.push(entry);
    if (this.log.length > 400) this.log.shift();
    for (const fn of this.anyHandlers) fn(entry);
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Handler<K>)(payload);
      } catch (err) {
        console.error(`[bus] a "${name}" handler threw — other handlers still ran`, err);
      }
    }
  }
}
