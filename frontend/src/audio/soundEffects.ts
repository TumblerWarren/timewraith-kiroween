/**
 * Procedural Web Audio Halloween / Gothic Clocktower sound effects for TimeWraith.
 * Frame-synchronized with the MidnightClock hand steps, the 12:00 midnight bell strike,
 * the 245-bat canvas swarm (`flight.time` 4.8s -> 8.4s), and the 2.6s ghost apparition.
 */

type Listener = (enabled: boolean) => void;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let enabled = true;
const MASTER_VOLUME = 1.35;
const listeners = new Set<Listener>();
let globalListenersAttached = false;

// State for frame-accurate bat swarm audio synchronization (flight.time: 4.8 -> 8.4)
let lastBatFlapStep = -1;
let lastBatChirpStep = -1;
let giantBatsTriggered = false;

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? win.webkitAudioContext ?? null;
}

function ensureContext(): AudioContext | null {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  if (!ctx || ctx.state === "closed") {
    try {
      ctx = new Ctor();
      masterGain = ctx.createGain();
      masterGain.gain.value = MASTER_VOLUME;
      masterGain.connect(ctx.destination);
    } catch {
      ctx = null;
      masterGain = null;
      return null;
    }
  }
  return ctx;
}

function outputNode(context: AudioContext): AudioNode {
  return masterGain ?? context.destination;
}

function notify() {
  for (const listener of listeners) listener(enabled);
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function isAudioContextRunning(): boolean {
  return ctx?.state === "running";
}

export function subscribeSoundState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function setSoundEnabled(next: boolean): Promise<boolean> {
  const context = ensureContext();
  if (!context) return false;
  try {
    if (next) {
      enabled = true;
      if (masterGain) masterGain.gain.setValueAtTime(MASTER_VOLUME, context.currentTime);
      if (context.state === "suspended") await context.resume();
      notify();
    } else {
      enabled = false;
      if (masterGain) masterGain.gain.setValueAtTime(0.0001, context.currentTime);
      notify();
      if (context.state === "running") await context.suspend();
    }
    return true;
  } catch {
    return false;
  }
}

export async function toggleSoundEnabled(): Promise<{ ok: boolean; unlockedFromSuspended: boolean }> {
  const context = ensureContext();
  if (!context) return { ok: false, unlockedFromSuspended: false };
  if (enabled && context.state === "suspended") {
    const ok = await setSoundEnabled(true);
    return { ok, unlockedFromSuspended: ok };
  }
  const ok = await setSoundEnabled(!enabled);
  return { ok, unlockedFromSuspended: false };
}

export function suspendSoundContext(): void {
  if (ctx && ctx.state === "running") {
    void ctx.suspend().catch(() => {});
  }
}

export function resumeSoundContextIfEnabled(): void {
  if (enabled && ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
}

function activeContext(): AudioContext | null {
  if (!enabled) return null;
  const context = ensureContext();
  if (!context) return null;
  if (context.state === "suspended") {
    void context.resume().catch(() => {});
  }
  return context;
}

/**
 * Heavy haunted grandfather-clock TICK / TOCK:
 * fires on each discrete movement of the clock hands (duration ~0.18s matching the hand snap).
 */
export function playClockTick(tock = false): void {
  const context = activeContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const out = outputNode(context);

    // 1. Primary escapement gear release at t=0 (as the hand starts moving)
    const click = context.createOscillator();
    const clickFilter = context.createBiquadFilter();
    const clickGain = context.createGain();
    click.type = "sawtooth";
    click.frequency.setValueAtTime(tock ? 1420 : 1760, now);
    click.frequency.exponentialRampToValueAtTime(280, now + 0.026);

    clickFilter.type = "bandpass";
    clickFilter.frequency.setValueAtTime(tock ? 1150 : 1480, now);
    clickFilter.Q.setValueAtTime(2.4, now);

    clickGain.gain.setValueAtTime(0.0001, now);
    clickGain.gain.exponentialRampToValueAtTime(0.28, now + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(out);
    click.start(now);
    click.stop(now + 0.035);

    // 2. Hollow wooden clock-case lock thud at +0.09s (as the hand settles into the minute mark)
    const lockTime = now + 0.085;
    const wood = context.createOscillator();
    const woodGain = context.createGain();
    wood.type = "triangle";
    const baseFreq = tock ? 116 : 138;
    wood.frequency.setValueAtTime(baseFreq, lockTime);
    wood.frequency.exponentialRampToValueAtTime(42, lockTime + 0.095);

    woodGain.gain.setValueAtTime(0.0001, lockTime);
    woodGain.gain.exponentialRampToValueAtTime(0.34, lockTime + 0.004);
    woodGain.gain.exponentialRampToValueAtTime(0.0001, lockTime + 0.11);

    wood.connect(woodGain);
    woodGain.connect(out);
    wood.start(lockTime);
    wood.stop(lockTime + 0.12);

    wood.onended = () => {
      wood.disconnect();
      woodGain.disconnect();
      click.disconnect();
      clickFilter.disconnect();
      clickGain.disconnect();
    };
  } catch {
    // Ignore scheduling errors
  }
}

/**
 * Ominous Gothic Halloween Midnight Bell:
 * Strikes at the exact instant the hands reach 360° (12:00 midnight, t = 4.7s)
 * with a metallic hammer impact + D-minor/tritone cathedral bell resonance.
 */
export function playMidnightBell(): void {
  const context = activeContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const out = outputNode(context);

    // Metallic bell-hammer strike transient at t = 0
    const strike = context.createOscillator();
    const strikeGain = context.createGain();
    strike.type = "square";
    strike.frequency.setValueAtTime(920, now);
    strike.frequency.exponentialRampToValueAtTime(146.83, now + 0.045);
    strikeGain.gain.setValueAtTime(0.0001, now);
    strikeGain.gain.exponentialRampToValueAtTime(0.26, now + 0.003);
    strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    strike.connect(strikeGain);
    strikeGain.connect(out);
    strike.start(now);
    strike.stop(now + 0.06);

    // D2, D3, F3 (minor third), Ab3 (devil's tritone), A3, D4, Ab4
    const partials = [73.42, 146.83, 174.61, 207.65, 220.0, 293.66, 415.3];
    partials.forEach((frequency, i) => {
      const osc = context.createOscillator();
      const detuneOsc = context.createOscillator();
      const gain = context.createGain();

      osc.type = i < 2 ? "triangle" : "sine";
      detuneOsc.type = "sine";
      osc.frequency.setValueAtTime(frequency, now);
      detuneOsc.frequency.setValueAtTime(frequency * (1 + 0.004 * (i % 2 === 0 ? 1 : -1)), now);

      const peak = 0.25 / (1 + i * 0.45);
      const decay = 3.6 / (1 + i * 0.2);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      osc.connect(gain);
      detuneOsc.connect(gain);
      gain.connect(out);
      osc.start(now);
      detuneOsc.start(now);
      osc.stop(now + decay + 0.05);
      detuneOsc.stop(now + decay + 0.05);
      osc.onended = () => {
        osc.disconnect();
        detuneOsc.disconnect();
        gain.disconnect();
      };
    });
  } catch {
    // Ignore scheduling errors
  }
}

/** Resets the frame-synced bat swarm tracker at the start of the intro timeline. */
export function resetSwarmAudio(): void {
  lastBatFlapStep = -1;
  lastBatChirpStep = -1;
  giantBatsTriggered = false;
}

/** Single leathery wing-flap burst scaled by how many/how close the bats are at `flight.time`. */
function playWingFlapBurst(intensity: number, pitchCenter: number): void {
  const context = activeContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const out = outputNode(context);
    const duration = 0.11;
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.sin((i / data.length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.setValueAtTime(1.6, now);
    filter.frequency.setValueAtTime(pitchCenter * 0.75, now);
    filter.frequency.exponentialRampToValueAtTime(pitchCenter * 1.35, now + duration * 0.45);
    filter.frequency.exponentialRampToValueAtTime(pitchCenter * 0.65, now + duration);

    const gain = context.createGain();
    const peak = Math.min(0.36, Math.max(0.04, intensity * 0.32));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.022);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(now);
    source.stop(now + duration + 0.01);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  } catch {
    // Ignore scheduling errors
  }
}

/** High-pitched bat echolocation chirp synced to the swarm flight. */
function playBatChirp(intensity: number, variant: number): void {
  const context = activeContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const out = outputNode(context);

    const chirp = context.createOscillator();
    const gain = context.createGain();
    const hi = 3100 - (variant % 4) * 290;
    chirp.type = "sine";
    chirp.frequency.setValueAtTime(hi, now);
    chirp.frequency.exponentialRampToValueAtTime(1180, now + 0.06);

    const peak = Math.min(0.09, Math.max(0.015, intensity * 0.08));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

    chirp.connect(gain);
    gain.connect(out);
    chirp.start(now);
    chirp.stop(now + 0.07);
    chirp.onended = () => {
      chirp.disconnect();
      gain.disconnect();
    };
  } catch {
    // Ignore scheduling errors
  }
}

/**
 * Heavy close-up wing-whoosh at `flight.time = 7.1s` when the 9 giant bats in `swarm.ts`
 * swoop inward across the camera to cover the clock in darkness (7.1s -> 7.8s).
 */
function playGiantBatsBlackout(): void {
  const context = activeContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const out = outputNode(context);
    const duration = 0.78;
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const env = Math.sin((i / data.length) * Math.PI);
      const heavyFlap = 0.5 + 0.5 * Math.sin(2 * Math.PI * 9.5 * t);
      data[i] = (Math.random() * 2 - 1) * env * heavyFlap;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(920, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + duration);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.42, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(now);
    source.stop(now + duration + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  } catch {
    // Ignore scheduling errors
  }
}

/**
 * Called directly inside `swarm.draw(flight.time)`'s `onUpdate` callback (4.8 <= time <= 8.4).
 * Uses the exact `time * 17` wing-flap phase from `swarm.ts` so every wing-flap burst,
 * bat chirp, and the 7.1s giant-bat blackout swoop matches the canvas animation frame-for-frame.
 */
export function syncSwarmAudio(time: number): void {
  if (!enabled || time < 4.8 || time > 8.1) return;

  // Normalized progress through the active bat flight (4.8 -> 7.9)
  const norm = Math.max(0, Math.min(1, (time - 4.8) / 3.1));
  // Intensity follows the visual density of bats on screen (builds up as bats fly closer, peaks at 6.5–7.4, fades by 8.0)
  const intensity = Math.sin(norm * Math.PI);

  // `swarm.ts` flaps wings with `Math.sin(time * 17 + phase)`: 17 rad/s is ~5.4 half-cycles per second (~11 flaps/sec)
  const flapStep = Math.floor((time - 4.8) * 10.8);
  if (flapStep > lastBatFlapStep) {
    lastBatFlapStep = flapStep;
    const pitch = 280 + Math.sin(flapStep * 1.3) * 90 + intensity * 240;
    playWingFlapBurst(intensity, pitch);
  }

  // Bat echolocation chirps roughly every ~0.35s while the swarm is dense
  const chirpStep = Math.floor((time - 4.95) * 2.9);
  if (time >= 4.95 && time <= 7.6 && chirpStep > lastBatChirpStep) {
    lastBatChirpStep = chirpStep;
    playBatChirp(intensity, chirpStep);
  }

  // Exact match for `if (time > 7.1)` in `swarm.ts` when the 9 giant bats converge over the screen
  if (time >= 7.1 && !giantBatsTriggered) {
    giantBatsTriggered = true;
    playGiantBatsBlackout();
  }
}

/**
 * Spooky Halloween Ghost Apparition (`t = 9.0s` -> `11.6s`):
 * Eerie theremin vibrato wail + dark diminished/minor spectral pad timed to the 2.6s ghost rise.
 */
export function playWraithMaterialize(): void {
  const context = activeContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const out = outputNode(context);

    const theremin = context.createOscillator();
    const vibrato = context.createOscillator();
    const vibratoGain = context.createGain();
    const thereminGain = context.createGain();

    theremin.type = "sine";
    theremin.frequency.setValueAtTime(293.66, now); // D4
    theremin.frequency.exponentialRampToValueAtTime(415.3, now + 1.0); // Ab4 (tritone glide)
    theremin.frequency.exponentialRampToValueAtTime(349.23, now + 2.5); // F4

    vibrato.type = "sine";
    vibrato.frequency.setValueAtTime(6.2, now);
    vibratoGain.gain.setValueAtTime(9.5, now);

    thereminGain.gain.setValueAtTime(0.0001, now);
    thereminGain.gain.exponentialRampToValueAtTime(0.11, now + 0.65);
    thereminGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);

    vibrato.connect(vibratoGain);
    vibratoGain.connect(theremin.frequency);
    theremin.connect(thereminGain);
    thereminGain.connect(out);

    vibrato.start(now);
    theremin.start(now);
    vibrato.stop(now + 2.65);
    theremin.stop(now + 2.65);

    [73.42, 103.83, 146.83, 174.61].forEach((freq, i) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = i < 2 ? "sawtooth" : "triangle";
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(420, now);

      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.11 / (1 + i * 0.35), now + 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 2.65);
      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    });

    theremin.onended = () => {
      vibrato.disconnect();
      vibratoGain.disconnect();
      theremin.disconnect();
      thereminGain.disconnect();
    };
  } catch {
    // Ignore scheduling errors
  }
}

/** Haunted whisper-flame pulse when the invitation appears at t = 11.1s. */
export function playLanternPulse(): void {
  const context = activeContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const out = outputNode(context);

    [220.0, 233.08, 311.13].forEach((freq, i) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "triangle";
      const start = now + i * 0.05;
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.96, start + 0.42);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.09 / (1 + i * 0.4), start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);

      osc.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(start + 0.48);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  } catch {
    // Ignore scheduling errors
  }
}

/** Dark gothic portal resonance when touching the lantern or starting an investigation. */
export function playEnterChime(): void {
  const context = activeContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const out = outputNode(context);

    [110.0, 164.81, 207.65, 293.66].forEach((freq, i) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = i === 0 ? "sawtooth" : "triangle";
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(680, now);

      const start = now + i * 0.045;
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.98, start + 0.75);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14 / (1 + i * 0.35), start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(start + 0.85);
      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    });
  } catch {
    // Ignore scheduling errors
  }
}

/**
 * Timed to the 3.8s `crew-eye-opening` and `crew-eye-turn` keyframes in `midnight-crew.css`:
 * - 0.65s (17% of 3.8s): Eyelid begins opening -> low dungeon swell
 * - 1.44s (38% of 3.8s): Iris rotates (-30deg -> 330deg) -> eerie tritone iris-turn glide
 * - 2.50s (66% of 3.8s): Eyelid closes back into darkness
 */
export function playEyeAwakening(): void {
  const context = activeContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const out = outputNode(context);

    // Eyelid opening swell (starts at +0.55s as the lid opens at 17% of 3.8s = 0.64s, peaks at 1.9s, fades by 3.2s)
    [55.0, 82.41, 116.54, 155.56].forEach((freq, i) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = i < 2 ? "sawtooth" : "triangle";
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(180, now + 0.5);
      filter.frequency.exponentialRampToValueAtTime(760, now + 1.8);
      filter.frequency.exponentialRampToValueAtTime(140, now + 3.2);

      osc.frequency.setValueAtTime(freq * 0.96, now + 0.5);
      osc.frequency.exponentialRampToValueAtTime(freq, now + 1.7);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.setValueAtTime(0.0001, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.15 / (1 + i * 0.35), now + 1.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.25);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(now + 0.5);
      osc.stop(now + 3.3);
      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    });

    // Iris rotation sound (38% to 70% of 3.8s = 1.44s to 2.66s)
    const irisOsc = context.createOscillator();
    const irisGain = context.createGain();
    irisOsc.type = "sine";
    irisOsc.frequency.setValueAtTime(220.0, now + 1.44);
    irisOsc.frequency.exponentialRampToValueAtTime(311.13, now + 2.1); // Eb4 tritone/minor
    irisOsc.frequency.exponentialRampToValueAtTime(207.65, now + 2.66);

    irisGain.gain.setValueAtTime(0.0001, now + 1.44);
    irisGain.gain.exponentialRampToValueAtTime(0.09, now + 1.85);
    irisGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.7);

    irisOsc.connect(irisGain);
    irisGain.connect(out);
    irisOsc.start(now + 1.44);
    irisOsc.stop(now + 2.75);
    irisOsc.onended = () => {
      irisOsc.disconnect();
      irisGain.disconnect();
    };
  } catch {
    // Ignore scheduling errors
  }
}

/** Subtle dark pocket-watch tick for buttons, tabs, and navigation links. */
export function playUiTick(): void {
  const context = activeContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const out = outputNode(context);

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(78, now + 0.04);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {
    // Ignore scheduling errors
  }
}

export function installGlobalUiSounds(): void {
  if (globalListenersAttached || typeof document === "undefined") return;
  globalListenersAttached = true;

  const unlock = () => {
    if (!enabled) return;
    const context = ensureContext();
    if (context && context.state === "suspended") {
      void context.resume().catch(() => {});
    }
  };

  document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  document.addEventListener("pointermove", unlock, { capture: true, passive: true });
  document.addEventListener("keydown", unlock, { capture: true, passive: true });
  document.addEventListener("touchstart", unlock, { capture: true, passive: true });

  document.addEventListener(
    "click",
    (event) => {
      if (!enabled) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const control = target.closest("button, a, [role='tab'], summary");
      if (!control) return;
      if (control.hasAttribute("data-sound-toggle")) return;
      if (
        control.classList.contains("cinema__lantern") ||
        control.classList.contains("midnight-submit") ||
        control.classList.contains("btn--primary")
      ) {
        playEnterChime();
      } else {
        playUiTick();
      }
    },
    { capture: true, passive: true },
  );
}

export type AnimationSoundCue = "weave" | "wake" | "legs" | "transform" | "bounce"
  | "search" | "reveal" | "materialize" | "pumpkin" | "conduct";

/** Short, cancellable silk and spider cues; share the app's sound switch and output. */
export function createAnimationSounds() {
  const voices = new Set<AudioScheduledSourceNode>();
  const track = (source: AudioScheduledSourceNode, nodes: AudioNode[]) => {
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      nodes.forEach(node => node.disconnect());
    };
  };
  const play = (cue: AnimationSoundCue) => {
    if (typeof document === "undefined" || document.hidden) return;
    const context = activeContext();
    // Do not queue sounds behind the browser's initial audio-unlock gesture.
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    const out = outputNode(context);
    const tone = (frequency: number, endFrequency: number, duration: number, peak: number, delay = 0) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + delay;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(gain); gain.connect(out);
      track(oscillator, [gain]);
      oscillator.start(start); oscillator.stop(start + duration + .02);
    };
    const silk = (duration: number, frequency: number, peak: number) => {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.sin(i / samples.length * Math.PI);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass"; filter.Q.value = 2.5;
      filter.frequency.setValueAtTime(frequency, now);
      filter.frequency.exponentialRampToValueAtTime(frequency * .45, now + duration);
      const gain = context.createGain(); gain.gain.value = peak;
      source.connect(filter); filter.connect(gain); gain.connect(out);
      track(source, [filter, gain]); source.start(now); source.stop(now + duration);
    };
    try {
      switch (cue) {
        case "weave": silk(.65, 2400, .055); tone(740, 540, .22, .018); break;
        case "wake": tone(220, 293.66, .5, .035); tone(440, 415.3, .45, .018, .1); break;
        case "legs": silk(.16, 1200, .035); tone(320, 170, .12, .02); break;
        case "transform": silk(.8, 1800, .045); tone(147, 294, .7, .035); break;
        case "bounce": tone(390, 260, .2, .012); break;
        case "search": silk(.35, 950, .065); tone(196, 247, .3, .045); break;
        case "reveal": tone(523, 659, .25, .065); tone(784, 880, .32, .03, .06); break;
        case "materialize": silk(.65, 1400, .07); tone(165, 330, .7, .07); tone(494, 659, .5, .035, .16); break;
        case "pumpkin": tone(98, 65, .28, .11); silk(.2, 650, .07); break;
        case "conduct": silk(.25, 1800, .045); tone(294, 440, .3, .055); break;
      }
    } catch {
      // Audio must never interrupt the form or its animation.
    }
  };
  return {
    play,
    stop() {
      for (const source of voices) {
        try { source.stop(); } catch { /* A voice may already have ended. */ }
      }
      voices.clear();
    },
  };
}

export const createSpiderSounds = createAnimationSounds;
