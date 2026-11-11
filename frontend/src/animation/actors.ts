/**
 * Actor registry interface (design "MotionDirector": effects find mascots through the actor registry).
 * Effects never import mascot or section components. A mascot registers a controller under its id when it
 * mounts (task 12.4 implements `mascots/actors.ts` against this interface); effects look it up by id.
 */

/** Mascot ids plus extra stage actors (for example `"case-sheet"` or `"clock"`). */
export type ActorId = string;
/** Pose names come from the rig specs (`rest`, `wave`, `act`, `bow` ...). */
export type PoseName = string;

export interface PlayOptions {
  readonly durationMs?: number;
  readonly delayMs?: number;
}

/** What a mascot exposes to effects: the rig controller `{ play, settle, look }` plus its root element. */
export interface ActorController {
  /** Root element whose transform and opacity whole-body effects may animate. */
  readonly element?: Element | null;
  /** Plays a pose and resolves when it has settled. Must not throw. */
  play(pose: PoseName, opts?: PlayOptions): Promise<void> | void;
  /** Jumps to the pose's final state (or rest) at once. Idempotent. */
  settle(pose?: PoseName): void;
  /** Turns eyes or head toward a viewport point. Optional. */
  look?(x: number, y: number): void;
}

export interface ActorRegistry {
  get(id: ActorId): ActorController | undefined;
  /** Registers a controller and returns an unregister function (call it on unmount). */
  register(id: ActorId, controller: ActorController): () => void;
}

/** A plain Map-backed registry. The latest registration of an id wins; unregistering an old one is a no-op. */
export function createActorRegistry(): ActorRegistry {
  const actors = new Map<ActorId, ActorController>();
  return {
    get: (id) => actors.get(id),
    register(id, controller) {
      actors.set(id, controller);
      return () => {
        if (actors.get(id) === controller) actors.delete(id);
      };
    },
  };
}
