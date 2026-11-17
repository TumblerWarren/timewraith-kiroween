import { FINAL_STAGES, type Bug, type FixAttempt, type GateResult, type Investigation, type ReplayEventMsg } from "../../api/types";

export function callProgress(event: ReplayEventMsg) {
  const calls = event.data?.calls;
  const max = event.data?.max_calls;
  return typeof calls === "number" && typeof max === "number" && calls >= 0 && max > 0 && calls <= max
    ? { calls, max }
    : null;
}

export function observedAnomalies(inv: Investigation, events: readonly ReplayEventMsg[]) {
  const final = FINAL_STAGES.includes(inv.stage);
  const verdicts = [...inv.decisions, ...events.flatMap((event) => {
    const data = event.data;
    return event.kind === "decision" && typeof data?.step === "string" && typeof data.subject === "string"
      ? [{ step: data.step, subject: data.subject, decision: data.decision, rule: typeof data.rule === "string" ? data.rule : "" }]
      : [];
  })];
  return inv.sweeps.flatMap((sweep) => {
    // The pipeline verifies only the first violation for each experiment.
    const violation = sweep.violations[0];
    if (!violation) return [];
    const matches = (finding: Bug | NonNullable<Investigation["intended"]>[number]) =>
      finding.experiment_id ? finding.experiment_id === sweep.experiment_id
        : finding.violation.invariant === violation.invariant && finding.violation.zone === violation.zone
          && finding.violation.instant === violation.instant;
    // The confirmed result already has a full card in the appropriate section.
    if (inv.bugs.some(matches) || inv.intended?.some(matches)) return [];
    const suffix = sweep.experiment_id.slice(4);
    const verdict = verdicts.findLast((decision) => decision.step === "judge_violation" &&
      (decision.subject === sweep.experiment_id || decision.subject === `bug_${suffix}` || decision.subject.startsWith(`int_${suffix}_`)));
    const repeat = verdicts.findLast((decision) => decision.step === "repeat" && decision.subject === sweep.experiment_id && decision.decision === "rejected");
    let state: "checking" | "intended" | "reproduced" | "notReported" = final || repeat || (verdict && verdict.decision !== "accepted")
      ? "notReported" : "checking";
    if (verdict?.decision === "accepted" && verdict.subject.startsWith("int_")) state = "intended";
    if (verdict?.decision === "accepted" && verdict.subject.startsWith("bug_")) state = "reproduced";
    return [{ id: sweep.experiment_id, violation, state, reason: verdict?.rule ?? repeat?.rule }];
  });
}

/** The event stream can finish an attempt before the case endpoint has saved it. */
export function visibleAttempts(bug: Bug, events: readonly ReplayEventMsg[]): readonly FixAttempt[] {
  const attempts = new Map<number, FixAttempt>(bug.fix.attempts.map((attempt) => [attempt.attempt, attempt]));
  const gates = new Map<number, GateResult[]>();
  let lastAttempt: number | undefined;
  for (const event of events) {
    const data = event.data;
    if (event.phase !== "fix" || !data) continue;
    const subject = event.kind === "decision" && data.step === "write_fix" ? data.subject : data.bug_id;
    if (subject !== bug.id) continue;
    if (typeof data.attempt === "number") lastAttempt = data.attempt;
    if (event.kind === "gate" && lastAttempt !== undefined && typeof data.gate === "string" && typeof data.detail === "string" && typeof data.passed === "boolean") {
      const existing = gates.get(lastAttempt) ?? [];
      existing.push({ gate: data.gate, detail: data.detail, passed: data.passed });
      gates.set(lastAttempt, existing);
    }
    const namedAttempt = /^Attempt (\d+)(?::| rejected)/.exec(event.text);
    const finished = (event.kind === "fix" && (namedAttempt || event.text.startsWith("Suggested fix · verified")))
      || (event.kind === "decision" && data.step === "write_fix");
    const number = namedAttempt ? Number(namedAttempt[1]) : lastAttempt;
    if (!finished || number === undefined || attempts.has(number)) continue;
    const results = gates.get(number) ?? [];
    attempts.set(number, {
      attempt: number,
      summary: typeof data.rule === "string" ? data.rule : event.text,
      root_cause: "",
      diff: "",
      gates: results,
      // Only a saved attempt can supply an accepted patch.
      accepted_by_gates: false,
    });
  }
  // Show gate progress as it arrives, then replace it with the saved attempt.
  for (const [number, results] of gates) {
    if (attempts.has(number)) continue;
    attempts.set(number, {
      attempt: number, summary: "", root_cause: "", diff: "", gates: results, accepted_by_gates: false,
    });
  }
  return [...attempts.values()].sort((a, b) => a.attempt - b.attempt);
}

export type ActivityItem = ReplayEventMsg | {
  readonly first: ReplayEventMsg;
  readonly tools: ReplayEventMsg[];
  readonly subject: string | undefined;
};

export function activityItems(events: readonly ReplayEventMsg[], inv?: Investigation): ActivityItem[] {
  const items: ActivityItem[] = [];
  const sessions = new Map<string, Exclude<ActivityItem, ReplayEventMsg>>();
  const subjects = new Map<string, string>();
  for (const event of events) {
    const actor = `${event.phase}/${event.actor}`;
    const clock = event.serverClock;
    if (event.kind === "dispatch" || (event.kind === "fix" && event.data?.calls === 0)) {
      if (clock && clock !== "not controlled") {
        const unit = clock.label.split("; unit-level sweep of ")[1];
        if (unit) subjects.set(actor, unit);
      }
      // Backends without explicit session IDs start their tool counters at one.
      if (event.kind === "dispatch") {
        for (const key of sessions.keys()) if (key.startsWith(`${actor}/`)) sessions.delete(key);
      }
    }
    if (event.kind !== "tool") {
      items.push(event);
      continue;
    }
    const data = event.data;
    const experiment = inv?.test_plan?.experiments.find((entry) => entry.id === data?.experiment_id);
    const candidate = inv?.feature_map?.candidates.find((entry) => entry.id === experiment?.candidate_id);
    const bug = inv?.bugs.find((entry) => entry.id === data?.bug_id);
    const key = [actor, data?.session_id, data?.experiment_id, data?.bug_id, data?.attempt].join("/");
    const session = sessions.get(key);
    const previous = session?.tools.at(-1)?.data?.calls;
    const calls = data?.calls;
    if (session && !(typeof previous === "number" && typeof calls === "number" && calls <= previous)) {
      session.tools.push(event);
    } else {
      const next = { first: event, tools: [event], subject: candidate?.unit.name ?? bug?.title ?? subjects.get(actor) };
      sessions.set(key, next);
      items.push(next);
    }
  }
  return items;
}
