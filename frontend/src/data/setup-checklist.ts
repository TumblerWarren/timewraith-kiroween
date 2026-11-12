import type { Health } from "../api/types";
import type { SetupCheck, SetupState, SetupStateId } from "./types";

/**
 * Readiness board states. Each state has a shape and text, so status is never color-only. The checks come from
 * the backend's `GET /health`; with no backend every check waits.
 */
export const SETUP_STATES: Readonly<Record<SetupStateId, SetupState>> = {
  ready: { id: "ready", shape: "check", glyph: "✓", text: "Ready" },
  waiting: { id: "waiting", shape: "hourglass", glyph: "…", text: "Waiting for the backend" },
  attention: { id: "attention", shape: "exclamation", glyph: "!", text: "Needs attention" },
};

/** The readiness checks for the current health answer (null: backend offline). */
export function setupChecks(health: Health | null): readonly SetupCheck[] {
  if (!health) {
    return [
      { id: "gateway", label: "TimeWraith backend", state: "waiting" },
      { id: "agents", label: "Kiro agent runtime", state: "waiting" },
      { id: "sandbox", label: "Docker sandbox", state: "waiting" },
    ];
  }
  const kiro = health.agent_runtime.name !== "stub";
  return [
    { id: "gateway", label: "TimeWraith backend", state: "ready" },
    { id: "agents", label: "Kiro agent runtime", state: kiro ? "ready" : "attention", detail: health.agent_runtime.label },
    { id: "sandbox", label: "Docker sandbox", state: health.sandbox.available ? "ready" : "attention", detail: health.sandbox.detail },
    { id: "git", label: "Git", state: health.git ? "ready" : "attention" },
  ];
}

export function setupStatusText(check: SetupCheck): string {
  const state = SETUP_STATES[check.state];
  return `${state.glyph} ${state.text}`;
}
