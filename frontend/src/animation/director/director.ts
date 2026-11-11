import { MAX_BATS, MAX_MICRO, P2_QUEUE_TIMEOUT_MS, P3_COOLDOWN_MS } from "../constants";
import type { EffectParamsMap } from "../effects/ids";
import { createNullServices, type EffectServices } from "../services";
import { RequestQueue } from "./queue";
import type {
  DirectorClock,
  DirectorConfig,
  DirectorEnv,
  DirectorEvent,
  DirectorSnapshot,
  DropReason,
  EffectContext,
  EffectDef,
  EffectHandle,
  EffectKind,
  EffectRegistryOf,
  EnvPatch,
  Priority,
  QueueInfo,
  RegionId,
  RequestOptions,
  RequestResult,
  RunInfo,
} from "./types";

export const DEFAULT_CONFIG: Readonly<DirectorConfig> = {
  p2QueueTimeoutMs: P2_QUEUE_TIMEOUT_MS,
  p3CooldownMs: P3_COOLDOWN_MS,
  maxBats: { ...MAX_BATS },
  maxMicro: MAX_MICRO,
  dev: false,
};

export const DEFAULT_ENV: DirectorEnv = {
  reducedMotion: false,
  hidden: false,
  compact: false,
  suppressed: { input: false, scrubber: false },
};

type AnyDef = EffectDef<unknown>;

interface Running {
  readonly ticket: number;
  readonly id: string;
  readonly key: string;
  readonly def: AnyDef;
  readonly params: unknown;
  readonly priority: Priority;
  readonly kind: EffectKind;
  readonly region: RegionId | null;
  readonly startedAt: number;
  readonly bats: number;
  readonly ctx: EffectContext;
  handle: EffectHandle | null;
  paused: boolean;
  watchdog: number | null;
}

interface Queued {
  readonly ticket: number;
  readonly id: string;
  readonly key: string;
  readonly def: AnyDef;
  readonly params: unknown;
  readonly priority: Priority;
  readonly kind: EffectKind;
  readonly enqueuedAt: number;
  readonly deadline: number | null;
  timer: number | null;
}

/**
 * The MotionDirector (design "MotionDirector"). Framework-free and deterministic: all time comes from the
 * injected clock. Admission order: Reduce Motion, duplicate, compact, P3 gates, P0, P1, P2; then queue
 * drain on every finish or cancel, env changes, failure containment and a `maxDurationMs` watchdog.
 *
 * The params map `M` defaults to the app registry; tests pass their own fake registries.
 */
export class MotionDirector<M extends object = EffectParamsMap> {
  private readonly cfg: DirectorConfig;
  private readonly running = new Map<number, Running>();
  private readonly queue = new RequestQueue<Queued>();
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<(e: DirectorEvent) => void>();
  private services: EffectServices;
  private env: DirectorEnv = DEFAULT_ENV;
  private lastP3StartAt = Number.NEGATIVE_INFINITY;
  private nextTicket = 1;
  private draining = false;
  /** While > 0, cancels inside one operation do not drain the queue; the operation drains once at the end. */
  private hold = 0;
  private disposed = false;

  constructor(
    private readonly registry: EffectRegistryOf<M>,
    private readonly clock: DirectorClock,
    cfg?: Partial<DirectorConfig>,
    services?: Partial<EffectServices>,
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg, maxBats: { ...DEFAULT_CONFIG.maxBats, ...cfg?.maxBats } };
    this.services = { ...createNullServices(), ...services };
  }

  // ---------------------------------------------------------------- public API

  request<K extends keyof M & string>(id: K, params: M[K], opts?: RequestOptions): RequestResult {
    return this.held(() => this.admit(id, params, opts));
  }

  private admit(id: string, params: unknown, opts?: RequestOptions): RequestResult {
    const def = (this.registry as Record<string, AnyDef | undefined>)[id];
    if (this.disposed) return this.drop(null, id, "preempted");
    if (!def) return this.drop(null, id, "failed");

    // 1. Reduce Motion: only the fallback, no caps.
    if (this.env.reducedMotion) {
      const ticket = this.nextTicket++;
      try {
        def.fallback.apply(this.context(0), params);
      } catch (err) {
        this.log(id, err);
      }
      this.emit({ type: "reduced", ticket, id, at: this.clock.now() });
      this.notify();
      return { status: "reduced", ticket };
    }

    const key = opts?.key ?? safeCall(() => def.key?.(params)) ?? id;

    // 2. Duplicate.
    if (this.queue.hasKey(key) || [...this.running.values()].some((r) => r.key === key)) {
      return this.drop(null, id, "duplicate");
    }
    // 3. Compact.
    if (this.env.compact && !def.allowCompact) return this.drop(null, id, "compact-disabled");

    const priority = def.priority;
    const region = def.kind === "ambient" || priority === 3 ? (safeCall(() => def.region?.(params)) ?? "overlay") : null;
    const now = this.clock.now();

    // 4. P3 gates.
    if (priority === 3) {
      const reason = this.p3Gate(def, params, region ?? "overlay", now);
      if (reason) return this.drop(null, id, reason);
      return this.start(def, id, key, params, region);
    }

    // 5. P0: cancel everything lower, drop queued P3, start now.
    if (priority === 0) {
      for (const r of [...this.running.values()]) if (r.priority > 0) this.cancelRunning(r, "preempted");
      for (const q of this.queue.ordered()) if (q.priority === 3) this.expire(q, "preempted");
      return this.start(def, id, key, params, region);
    }

    // 6. P1: cancel running P3, queue behind a scene (no timeout).
    if (priority === 1) {
      this.cancelP3("preempted");
      if (this.blocked(def, params)) return this.enqueue(def, id, key, params, null);
      return this.start(def, id, key, params, region);
    }

    // 7. P2: start, or queue with a deadline.
    if (this.blocked(def, params)) return this.enqueue(def, id, key, params, now + this.cfg.p2QueueTimeoutMs);
    return this.start(def, id, key, params, region);
  }

  setEnv(patch: EnvPatch): void {
    this.held(() => this.applyEnv(patch));
  }

  private applyEnv(patch: EnvPatch): void {
    const prev = this.env;
    this.env = {
      reducedMotion: patch.reducedMotion ?? prev.reducedMotion,
      hidden: patch.hidden ?? prev.hidden,
      compact: patch.compact ?? prev.compact,
      suppressed: { ...prev.suppressed, ...patch.suppressed },
    };
    const env = this.env;

    if (env.reducedMotion && !prev.reducedMotion) {
      for (const r of [...this.running.values()]) this.cancelRunning(r, "env");
      for (const q of this.queue.ordered()) this.expire(q, "preempted");
    }
    if (env.suppressed.input || env.suppressed.scrubber) this.cancelP3("env");
    if (env.compact) {
      for (const r of [...this.running.values()]) if (!r.def.allowCompact) this.cancelRunning(r, "env");
      // Shrinking the cap cancels the newest bat users until the bats fit.
      const users = [...this.running.values()].filter((r) => r.bats > 0).reverse();
      for (const r of users) {
        if (this.batsInUse() <= this.batCap()) break;
        this.cancelRunning(r, "env");
      }
    }
    for (const r of this.running.values()) {
      if (r.priority !== 3 || !r.handle) continue;
      if (env.hidden && !r.paused) {
        r.paused = true;
        safeCall(() => r.handle?.pause());
      } else if (!env.hidden && r.paused) {
        r.paused = false;
        safeCall(() => r.handle?.resume());
      }
    }
    this.writeAmbientAttribute();
    this.notify();
  }

  /** Runs one operation with draining held, then drains once. */
  private held<T>(fn: () => T): T {
    this.hold++;
    try {
      return fn();
    } finally {
      this.hold--;
      this.drain();
    }
  }

  /** Replaces injected services (actors, bat pool, overlay, animator, root). */
  setServices(patch: Partial<EffectServices>): void {
    this.services = { ...this.services, ...patch };
    this.writeAmbientAttribute();
  }

  getEnv(): DirectorEnv {
    return this.env;
  }

  snapshot(): DirectorSnapshot {
    const running: RunInfo[] = [...this.running.values()].map((r) => ({
      ticket: r.ticket,
      id: r.id,
      key: r.key,
      priority: r.priority,
      kind: r.kind,
      region: r.region,
      startedAt: r.startedAt,
      bats: r.bats,
      paused: r.paused,
    }));
    const queued: QueueInfo[] = this.queue.ordered().map((q) => ({
      ticket: q.ticket,
      id: q.id,
      key: q.key,
      priority: q.priority,
      kind: q.kind,
      enqueuedAt: q.enqueuedAt,
      deadline: q.deadline,
    }));
    return { running, queued, lastP3StartAt: this.lastP3StartAt, env: this.env };
  }

  /** Change notifications (no payload); returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Detailed lifecycle events; returns an unsubscribe function. */
  onEvent(fn: (e: DirectorEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  dispose(): void {
    if (this.disposed) return;
    for (const r of [...this.running.values()]) this.cancelRunning(r, "dispose");
    for (const q of this.queue.ordered()) this.expire(q, "preempted");
    this.disposed = true;
    this.listeners.clear();
    this.eventListeners.clear();
  }

  // ---------------------------------------------------------------- admission helpers

  private p3Gate(def: AnyDef, params: unknown, region: RegionId, now: number): DropReason | null {
    const env = this.env;
    if (env.suppressed.input || env.suppressed.scrubber) return "suppressed";
    if (env.hidden) return "hidden";
    if (now - this.lastP3StartAt < this.cfg.p3CooldownMs) return "cooldown";
    for (const r of this.running.values()) {
      if (r.priority === 0) return "preempted";
      if (r.region === region && (r.kind === "ambient" || r.priority === 3)) return "region-busy";
    }
    if (this.batsNeeded(def, params) > this.batCap() - this.batsInUse()) return "region-busy";
    return null;
  }

  /** True when the effect cannot start now and must wait in the queue. */
  private blocked(def: AnyDef, params: unknown): boolean {
    const all = [...this.running.values()];
    if (def.priority > 0 && all.some((r) => r.priority === 0)) return true;
    const sceneRunning = all.some((r) => r.kind === "scene");
    if (def.kind === "scene" && sceneRunning) return true;
    if (def.priority === 1 && sceneRunning) return true;
    if (def.priority >= 2) {
      if (def.kind === "burst" && all.some((r) => r.kind === "burst")) return true;
      if (def.kind === "micro" && all.filter((r) => r.kind === "micro").length >= this.cfg.maxMicro) return true;
    }
    return this.batsNeeded(def, params) > this.batCap() - this.batsInUse();
  }

  private batCap(): number {
    return this.env.compact ? this.cfg.maxBats.compact : this.cfg.maxBats.regular;
  }

  private batsInUse(): number {
    let n = 0;
    for (const r of this.running.values()) n += r.bats;
    return n;
  }

  private batsNeeded(def: AnyDef, params: unknown): number {
    if (!def.bats) return 0;
    const n = safeCall(() => def.bats?.(params, this.env)) ?? 0;
    return Number.isFinite(n) ? Math.min(this.batCap(), Math.max(0, Math.floor(n))) : 0;
  }

  // ---------------------------------------------------------------- lifecycle

  private start(def: AnyDef, id: string, key: string, params: unknown, region: RegionId | null, ticket = this.nextTicket++): RequestResult {
    const bats = this.batsNeeded(def, params);
    const now = this.clock.now();
    const rec: Running = {
      ticket,
      id,
      key,
      def,
      params,
      priority: def.priority,
      kind: def.kind,
      region,
      startedAt: now,
      bats,
      ctx: this.context(bats),
      handle: null,
      paused: false,
      watchdog: null,
    };
    if (def.priority === 3) this.lastP3StartAt = now;
    this.running.set(ticket, rec);

    let handle: EffectHandle;
    try {
      handle = def.run(rec.ctx, params);
      if (!handle || typeof handle.finished?.then !== "function") throw new Error("run() returned no handle");
    } catch (err) {
      // 10. Failure containment: settle, log in dev, never reach the UI.
      this.running.delete(ticket);
      this.log(id, err);
      this.safeSettle(def, rec.ctx, params, id);
      this.notify();
      this.drain();
      return this.drop(ticket, id, "failed");
    }
    rec.handle = handle;
    rec.watchdog = this.clock.setTimeout(() => {
      rec.watchdog = null;
      if (this.running.get(ticket) === rec) this.cancelRunning(rec, "watchdog");
    }, Math.max(0, def.maxDurationMs));
    handle.finished.then(
      () => this.finish(rec),
      (err: unknown) => {
        this.log(id, err);
        if (this.running.get(ticket) === rec) this.cancelRunning(rec, "watchdog");
      },
    );
    this.emit({ type: "started", ticket, id, at: now });
    this.notify();
    return { status: "started", ticket };
  }

  private finish(rec: Running): void {
    if (this.running.get(rec.ticket) !== rec) return; // already cancelled and settled
    this.running.delete(rec.ticket);
    if (rec.watchdog !== null) this.clock.clearTimeout(rec.watchdog);
    this.emit({ type: "completed", ticket: rec.ticket, id: rec.id, at: this.clock.now() });
    this.notify();
    this.drain();
  }

  private cancelRunning(rec: Running, cause: "preempted" | "watchdog" | "env" | "dispose"): void {
    if (this.running.get(rec.ticket) !== rec) return;
    this.running.delete(rec.ticket);
    if (rec.watchdog !== null) this.clock.clearTimeout(rec.watchdog);
    rec.watchdog = null;
    safeCall(() => rec.handle?.cancel());
    this.safeSettle(rec.def, rec.ctx, rec.params, rec.id);
    this.emit({ type: "cancelled", ticket: rec.ticket, id: rec.id, at: this.clock.now(), cause });
    this.notify();
    this.drain();
  }

  private cancelP3(cause: "preempted" | "env"): void {
    for (const r of [...this.running.values()]) if (r.priority === 3) this.cancelRunning(r, cause);
  }

  private enqueue(def: AnyDef, id: string, key: string, params: unknown, deadline: number | null): RequestResult {
    const ticket = this.nextTicket++;
    const now = this.clock.now();
    const q: Queued = { ticket, id, key, def, params, priority: def.priority, kind: def.kind, enqueuedAt: now, deadline, timer: null };
    if (deadline !== null) {
      q.timer = this.clock.setTimeout(() => {
        q.timer = null;
        if (this.queue.has(ticket)) this.expire(q, "queue-timeout");
      }, Math.max(0, deadline - now));
    }
    this.queue.add(q);
    this.emit({ type: "queued", ticket, id, at: now });
    this.notify();
    return { status: "queued", ticket };
  }

  /** Removes a queued entry without running it; its `settle` runs exactly once. */
  private expire(q: Queued, reason: DropReason): void {
    if (!this.queue.remove(q.ticket)) return;
    if (q.timer !== null) this.clock.clearTimeout(q.timer);
    q.timer = null;
    this.safeSettle(q.def, this.context(0), q.params, q.id);
    this.drop(q.ticket, q.id, reason);
    this.notify();
  }

  /** 8. Queue drain: highest priority first, FIFO among equals; expired entries are dropped and settled. */
  private drain(): void {
    if (this.draining || this.hold > 0 || this.disposed) return;
    this.draining = true;
    try {
      const now = this.clock.now();
      for (const q of this.queue.ordered()) {
        if (!this.queue.has(q.ticket)) continue;
        if (q.deadline !== null && now >= q.deadline) {
          this.expire(q, "queue-timeout");
          continue;
        }
        if (this.blocked(q.def, q.params)) continue;
        this.queue.remove(q.ticket);
        if (q.timer !== null) this.clock.clearTimeout(q.timer);
        q.timer = null;
        if (q.priority === 1) this.cancelP3("preempted");
        this.start(q.def, q.id, q.key, q.params, null, q.ticket);
      }
    } finally {
      this.draining = false;
    }
  }

  // ---------------------------------------------------------------- utilities

  private context(batBudget: number): EffectContext {
    return { env: this.env, clock: this.clock, services: this.services, batBudget };
  }

  private safeSettle(def: AnyDef, ctx: EffectContext, params: unknown, id: string): void {
    try {
      def.settle(ctx, params);
    } catch (err) {
      this.log(id, err);
    }
  }

  private drop(ticket: number | null, id: string, reason: DropReason): RequestResult {
    this.emit({ type: "dropped", ticket, id, at: this.clock.now(), reason });
    return { status: "dropped", reason };
  }

  private writeAmbientAttribute(): void {
    const root = this.services.root;
    if (!root) return;
    const paused = this.env.hidden || this.env.suppressed.input || this.env.suppressed.scrubber;
    safeCall(() => root.setAttribute("data-ambient", paused ? "paused" : "running"));
  }

  private emit(e: DirectorEvent): void {
    for (const fn of [...this.eventListeners]) safeCall(() => fn(e));
  }

  private notify(): void {
    for (const fn of [...this.listeners]) safeCall(fn);
  }

  private log(id: string, err: unknown): void {
    if (this.cfg.dev) console.error(`[MotionDirector] effect "${id}" failed`, err);
  }
}

function safeCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
