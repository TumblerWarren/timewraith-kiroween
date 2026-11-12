import type { CaseStateId } from "./status";

/** A distinct inked shape per state, so status is never told by colour alone. Decorative: the label carries it. */
export function StateShape({ state, size = 20 }: { readonly state: CaseStateId; readonly size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg className="state-shape" data-shape={state} viewBox="0 0 24 24" width={size} height={size} focusable="false" aria-hidden="true">
      {state === "draft" ? <circle cx={12} cy={12} r={8.5} {...common} strokeDasharray="3 3" /> : null}
      {state === "queued" ? <path d="M6 3.5 L18 3.5 L12.5 12 L18 20.5 L6 20.5 L11.5 12 Z" {...common} /> : null}
      {state === "running" ? (
        <>
          <circle cx={12} cy={12} r={8.5} {...common} />
          <path className="state-shape__hand" d="M12 12 L12 6" {...common} strokeWidth={2.8} />
          <path d="M12 12 L15.5 13.5" {...common} />
        </>
      ) : null}
      {state === "waiting" ? (
        <>
          <path d="M6 17 L6 11 C6 7.5 8.5 5 12 5 C15.5 5 18 7.5 18 11 L18 17 L20 19 L4 19 Z" {...common} />
          <path d="M10 21.5 L14 21.5" {...common} />
        </>
      ) : null}
      {state === "failed" ? (
        <>
          <path d="M12 2.5 L22 20.5 L2 20.5 Z" {...common} />
          <path d="M9 11 L15 17 M15 11 L9 17" {...common} />
        </>
      ) : null}
      {state === "cancelled" ? <rect x={5} y={5} width={14} height={14} {...common} /> : null}
      {state === "done" ? (
        <>
          <path d="M12 2.5 L20.5 7.25 L20.5 16.75 L12 21.5 L3.5 16.75 L3.5 7.25 Z" {...common} />
          <path d="M8 12.5 L11 15.5 L16.5 9" {...common} strokeWidth={2.8} />
        </>
      ) : null}
    </svg>
  );
}

/** The status pill used in lists, the case banner and the header. */
export function StatusPill({ state, label }: { readonly state: CaseStateId; readonly label: string }) {
  return (
    <span className="status-pill" data-state={state}>
      <StateShape state={state} size={18} />
      <span>{label}</span>
    </span>
  );
}
