import type { Investigation, ReplayEventMsg, Stage } from "../api/types";
import { NO_ANOMALY } from "../content/copy";
import type { MascotId } from "../mascots/ids";
import type { Case } from "../cases/model";

/**
 * One status model for every page (cases list, case banner, home, header). Every state has a label, a shape and a
 * mascot, so it is never told by colour alone, and a one-line detail that says what is happening or what went wrong.
 */
export type CaseStateId = "draft" | "queued" | "running" | "waiting" | "failed" | "cancelled" | "done";

export interface CaseState {
  readonly id: CaseStateId;
  readonly label: string;
  /** What is happening now, what it needs from you, or why it stopped. */
  readonly detail: string;
  /** Who is on stage for this state. */
  readonly mascot: MascotId;
}

export const STATE_LABELS: Readonly<Record<CaseStateId, string>> = {
  draft: "Draft, not run",
  queued: "Queued",
  running: "Running",
  waiting: "Waiting for you",
  failed: "Failed",
  cancelled: "Cancelled",
  done: "Done",
};

/** What each running stage is doing, and who does it. */
export const STAGE_TEXT: Readonly<Record<Stage, { readonly text: string; readonly mascot: MascotId }>> = {
  queued: { text: "Waiting for a free slot", mascot: "watchtower-warden" },
  cloning: { text: "Cloning the repository", mascot: "wraith-director" },
  analyzing: { text: "Reading the manifests and test setup", mascot: "gargoyle-gatekeeper" },
  discovering: { text: "Finding time-sensitive code", mascot: "bat-scout" },
  designing: { text: "Designing the experiments", mascot: "pumpkin-mechanic" },
  "awaiting-plan-approval": { text: "The plan is ready. Review the experiments and approve them to continue.", mascot: "watchtower-warden" },
  installing: { text: "Installing dependencies in the sandbox", mascot: "cauldron-cat" },
  experimenting: { text: "Sweeping clock settings through each experiment", mascot: "spider-weaver" },
  verifying: { text: "Re-running each broken rule and judging it", mascot: "raven-archivist" },
  fixing: { text: "Writing and testing fixes", mascot: "doctor-stitch" },
  completed: { text: "Finished", mascot: "raven-archivist" },
  failed: { text: "Stopped", mascot: "raven-archivist" },
  cancelled: { text: "Cancelled", mascot: "watchtower-warden" },
};

/** The backend's note when the Kiro account is out of usage (agents.QUOTA_MESSAGE). */
const QUOTA = /usage limit reached/i;

const RUNNING: readonly Stage[] = ["cloning", "analyzing", "discovering", "designing", "installing", "experimenting", "verifying", "fixing"];

/** Plain words for the backend's stop codes. The backend's own message is kept when it says more. */
const FAILURES: Readonly<Record<string, string>> = {
  ref_not_found: "That branch, tag or commit was not found in the repository.",
  invalid_ref: "The ref is not a valid branch, tag or commit.",
  invalid_repository_url: "The repository address is not a public GitHub repository.",
  git_failed: "Git could not fetch the repository.",
  clone_timeout: "Cloning took longer than the time limit.",
  repository_too_large: "The repository is larger than the 500 MB limit.",
  too_many_files: "The repository has more files than the limit.",
  sandbox_unavailable: "Docker is not running, so nothing could run. Start it on the Crew page and open the case again.",
  install_failed: "Installing the repository's dependencies failed in the sandbox.",
  budget_time: "The investigation used up its time limit.",
  issue_required: "This mode needs an issue address.",
  invalid_issue_url: "The issue address is not a GitHub issue.",
  issue_fetch_failed: "The issue could not be read from GitHub.",
  interrupted: "The backend restarted while this case was running.",
  internal_error: "The backend hit an internal error.",
};

/** "Ref 'master' not found. The default branch is 'main'." → "main". */
export function suggestedRef(message: string | null | undefined): string | null {
  const m = /default branch is '([^']+)'/.exec(message ?? "");
  return m ? (m[1] as string) : null;
}

export function failureText(code: string | null | undefined, message: string | null | undefined): string {
  const plain = code ? FAILURES[code] : undefined;
  if (message && (!plain || suggestedRef(message))) return message;
  return plain ?? message ?? "The investigation stopped.";
}

/** "2 bugs reproduced · 1 fix verified", the repository's intended behaviour, or the honest negative. */
export function resultLine(bugs: number, verified: number, intended = 0): string {
  const why = `${intended} ${intended === 1 ? "finding is" : "findings are"} intended behaviour the repository documents`;
  if (bugs === 0) return intended > 0 ? `No bugs: ${why}` : NO_ANOMALY;
  const b = `${bugs} ${bugs === 1 ? "bug" : "bugs"} reproduced · ${verified} ${verified === 1 ? "fix" : "fixes"} verified`;
  return intended > 0 ? `${b} · ${intended} intended` : b;
}

/** Tool calls so far in the running attempt, from the latest tool event for that bug and attempt. */
export function toolProgress(events: readonly ReplayEventMsg[], bugId: string, attempt: number): { calls: number; max: number } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const d = events[i]?.data;
    if (!d || d.bug_id !== bugId || d.attempt !== attempt) continue;
    if (typeof d.calls === "number" && typeof d.max_calls === "number") return { calls: d.calls, max: d.max_calls };
  }
  return null;
}

/** The fix step in words: "Fixing bug 1 of 2 · attempt 2 of 3 · 12 of 30 tool calls". */
function fixingText(inv: Investigation, maxAttempts: number, events: readonly ReplayEventMsg[]): string {
  const fixable = inv.bugs.filter((b) => b.fix.state !== "skipped");
  const i = fixable.findIndex((b) => b.fix.state === "in-progress");
  const bug = fixable[i];
  if (i < 0 || !bug) return STAGE_TEXT.fixing.text;
  const attempt = Math.min(bug.fix.attempts.length + 1, maxAttempts);
  const tools = toolProgress(events, bug.id, attempt);
  const base = `Fixing bug ${i + 1} of ${fixable.length} · attempt ${attempt} of ${maxAttempts}`;
  return tools ? `${base} · ${tools.calls} of ${tools.max} tool calls` : base;
}

/** Verified fixes still waiting for your accept or reject. */
export function pendingFixes(inv: Investigation | null | undefined): number {
  return inv ? inv.bugs.filter((b) => b.fix.state === "verified" && b.fix.user_decision === "pending").length : 0;
}

export function caseState(c: Case, inv?: Investigation | null, maxAttempts = 3, events: readonly ReplayEventMsg[] = []): CaseState {
  if (c.kind === "draft") {
    return { id: "draft", label: STATE_LABELS.draft, detail: "Saved in this browser. Run it when the backend is online.", mascot: "skeleton-scribe" };
  }
  const s = c.summary;
  const stage = inv?.stage ?? s.stage;
  const bugs = inv ? inv.bugs.length : s.bug_count;
  const verified = inv ? inv.bugs.filter((b) => b.fix.state === "verified").length : (s.fix_verified_count ?? 0);
  const intended = inv ? (inv.intended?.length ?? 0) : (s.intended_count ?? 0);

  if (stage === "awaiting-plan-approval") {
    return { id: "waiting", label: STATE_LABELS.waiting, detail: STAGE_TEXT[stage].text, mascot: "watchtower-warden" };
  }
  if (stage === "completed" && pendingFixes(inv) > 0) {
    const n = pendingFixes(inv);
    return {
      id: "waiting",
      label: STATE_LABELS.waiting,
      detail: `${n === 1 ? "A fix" : `${n} fixes`} passed all 8 gates. Review ${n === 1 ? "it" : "them"} on the Fixes tab, then accept or reject.`,
      mascot: "doctor-stitch",
    };
  }
  if (stage === "queued") return { id: "queued", label: STATE_LABELS.queued, detail: STAGE_TEXT.queued.text, mascot: STAGE_TEXT.queued.mascot };
  if (RUNNING.includes(stage)) {
    const detail = stage === "fixing" && inv ? fixingText(inv, maxAttempts, events) : STAGE_TEXT[stage].text;
    return { id: "running", label: STATE_LABELS.running, detail, mascot: STAGE_TEXT[stage].mascot };
  }
  if (stage === "failed") {
    const code = inv ? inv.error : s.error;
    const message = inv ? (inv.notes[inv.notes.length - 1] ?? null) : s.message;
    return { id: "failed", label: STATE_LABELS.failed, detail: failureText(code, message), mascot: "raven-archivist" };
  }
  if (stage === "cancelled") return { id: "cancelled", label: STATE_LABELS.cancelled, detail: "Cancelled before it finished.", mascot: "watchtower-warden" };
  // Agents that could not run leave findings unjudged: say so instead of a clean "Done".
  const quota = inv?.notes.find((n) => QUOTA.test(n));
  if (quota) {
    const soFar = bugs === 0 ? "Findings were not judged." : `${resultLine(bugs, verified)}; the rest were not judged.`;
    return { id: "failed", label: "Agents stopped", detail: `${quota} ${soFar}`, mascot: "watchtower-warden" };
  }
  return { id: "done", label: STATE_LABELS.done, detail: resultLine(bugs, verified, intended), mascot: "raven-archivist" };
}
