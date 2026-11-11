import type { EffectServices } from "../services";

/** P0 user-critical, P1 state-critical, P2 direct interaction, P3 ambient. */
export type Priority = 0 | 1 | 2 | 3;
export type EffectKind = "scene" | "burst" | "micro" | "ambient";
/** Section id, or `"overlay"`. */
export type RegionId = string;

export interface DirectorClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export type FinishStatus = "completed" | "cancelled";

export interface EffectHandle {
  /** Stops the effect. The director runs `settle` right after, so the final state is reached either way. */
  cancel(): void;
  pause(): void;
  resume(): void;
  finished: Promise<FinishStatus>;
}

export type SuppressSource = "input" | "scrubber";

export interface DirectorEnv {
  readonly reducedMotion: boolean;
  readonly hidden: boolean;
  /** Viewport below 768 px. */
  readonly compact: boolean;
  readonly suppressed: Readonly<Record<SuppressSource, boolean>>;
}

export type EnvPatch = Partial<{
  reducedMotion: boolean;
  hidden: boolean;
  compact: boolean;
  suppressed: Partial<Record<SuppressSource, boolean>>;
}>;

export interface EffectContext {
  readonly env: DirectorEnv;
  readonly clock: DirectorClock;
  readonly services: EffectServices;
  /** Bat sprites the director granted this run (0 for effects without `bats`). */
  readonly batBudget: number;
}

export interface ReducedFallback<P> {
  kind: "static" | "fade";
  /** Required if `kind` is "fade"; at most 150 (`MAX_REDUCED_FADE_MS`). */
  fadeMs?: number;
  /** Idempotent; ends in the final state. */
  apply(ctx: EffectContext, params: P): void;
}

export interface EffectDef<P = void> {
  id: string;
  priority: Priority;
  kind: EffectKind;
  /** Watchdog: the director cancels (and settles) the effect after this. */
  maxDurationMs: number;
  /** false: dropped below 768 px. */
  allowCompact: boolean;
  /** Ambient only: the region whose one-ambient cap applies. Defaults to `"overlay"`. */
  region?(params: P): RegionId;
  /** Default duplicate key (the request's `opts.key` wins). Defaults to the effect id. */
  key?(params: P): string;
  /** Bat sprites this run needs; counted against the 14 / 6 cap. */
  bats?(params: P, env: DirectorEnv): number;
  run(ctx: EffectContext, params: P): EffectHandle;
  /** Final static state, used on drop, cancel, watchdog and failure. Idempotent. */
  settle(ctx: EffectContext, params: P): void;
  /** Reduce Motion path. Required for every effect. */
  fallback: ReducedFallback<P>;
}

/** A registry keyed by effect id, typed by a params map `{ id: Params }`. */
export type EffectRegistryOf<M> = { readonly [K in keyof M & string]: EffectDef<M[K]> };

/** `failed` is an addition to the design's list: `run` threw, or the id is unknown at runtime. */
export type DropReason =
  | "duplicate"
  | "suppressed"
  | "hidden"
  | "cooldown"
  | "region-busy"
  | "queue-timeout"
  | "compact-disabled"
  | "preempted"
  | "failed";

export type RequestResult =
  | { status: "started" | "queued" | "reduced"; ticket: number }
  | { status: "dropped"; reason: DropReason };

export interface RequestOptions {
  /** Duplicate key; defaults to `def.key(params)`, then the effect id. */
  key?: string;
}

export interface RunInfo {
  readonly ticket: number;
  readonly id: string;
  readonly key: string;
  readonly priority: Priority;
  readonly kind: EffectKind;
  readonly region: RegionId | null;
  readonly startedAt: number;
  readonly bats: number;
  readonly paused: boolean;
}

export interface QueueInfo {
  readonly ticket: number;
  readonly id: string;
  readonly key: string;
  readonly priority: Priority;
  readonly kind: EffectKind;
  readonly enqueuedAt: number;
  /** null for P1 (no timeout). */
  readonly deadline: number | null;
}

export interface DirectorSnapshot {
  readonly running: readonly RunInfo[];
  readonly queued: readonly QueueInfo[];
  readonly lastP3StartAt: number;
  readonly env: DirectorEnv;
}

/** Detailed lifecycle events, for tests and the dev debug overlay. */
export type DirectorEvent =
  | { type: "started"; ticket: number; id: string; at: number }
  | { type: "queued"; ticket: number; id: string; at: number }
  | { type: "reduced"; ticket: number; id: string; at: number }
  | { type: "completed"; ticket: number; id: string; at: number }
  | { type: "cancelled"; ticket: number; id: string; at: number; cause: "preempted" | "watchdog" | "env" | "dispose" }
  | { type: "dropped"; ticket: number | null; id: string; at: number; reason: DropReason };

export interface DirectorConfig {
  p2QueueTimeoutMs: number;
  p3CooldownMs: number;
  maxBats: { regular: number; compact: number };
  maxMicro: number;
  /** Logs effect failures to the console (dev builds). */
  dev: boolean;
}
