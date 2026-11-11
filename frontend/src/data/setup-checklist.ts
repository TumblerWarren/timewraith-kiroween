import type { SetupCheck, SetupState, SetupStateId } from "./types";

/**
 * Setup_Checklist mock data (Requirements 6.2, 6.3, 16.4).
 * Every status string contains "simulated" and uses a glyph plus text, so no status reads as a
 * live check and none is color-only. The list is shown under the label "Demo mode, simulated status".
 */
export const SETUP_STATES: Readonly<Record<SetupStateId, SetupState>> = {
  ready: { id: "ready", shape: "check", glyph: "✓", text: "Ready (simulated)" },
  waiting: { id: "waiting", shape: "hourglass", glyph: "…", text: "Waiting (simulated)" },
  attention: { id: "attention", shape: "exclamation", glyph: "!", text: "Needs attention (simulated)" },
};

export const SETUP_CHECKS: readonly SetupCheck[] = [
  { id: "browser", label: "Browser runner", state: "ready" },
  { id: "clock", label: "Clock control", state: "ready" },
  { id: "sandbox", label: "Local sandbox", state: "ready" },
  { id: "allowlist", label: "Target allowlist", state: "waiting" },
  { id: "fixed-build", label: "Fixed-version build", state: "attention" },
];

export function setupStatusText(check: SetupCheck): string {
  const state = SETUP_STATES[check.state];
  return `${state.glyph} ${state.text}`;
}
