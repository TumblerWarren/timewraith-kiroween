export type CaseFlowIconId = "repository" | "plan" | "verification" | "fix";

// Lantern, woven experiment paths, watchful eye, and a threaded needle.
// Each mark shares a 32px grid and the same rounded, open-line treatment.
const ICONS: Record<CaseFlowIconId, { outline: string; detail: string }> = {
  repository: {
    outline: "M12 8V6a4 4 0 0 1 8 0v2 M9 9h14 M11 9l-2 16h14L21 9 M8 28h16 M11 25v3 M21 25v3",
    detail: "M16 12v10 M12 17h8 M13 14l6 6 M19 14l-6 6",
  },
  plan: {
    outline: "M16 3v26 M3 16h26 M7 7l18 18 M7 25L25 7 M16 8l6 2 2 6-2 6-6 2-6-2-2-6 2-6Z",
    detail: "M16 12l3 1 1 3-1 3-3 1-3-1-1-3 1-3Z M16 3l9 4 4 9-4 9-9 4-9-4-4-9 4-9Z",
  },
  verification: {
    outline: "M3 16c4-6 8-9 13-9s9 3 13 9c-4 6-8 9-13 9S7 22 3 16Z M16 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z M16 13v4l-2 2",
    detail: "M16 3v2 M16 27v2 M5 7l2 2 M25 23l2 2 M27 7l-2 2 M7 23l-2 2",
  },
  fix: {
    outline: "M5 27 20 7c3-4 7-5 7-2s-1 5-5 8L5 27Z M22 6l1.5 1.5 M24 11c7 1 6 9 0 9h-5c-6 0-6 8 0 8h5",
    detail: "M8 7h7 M8 4v6 M11 5v4 M14 5v4",
  },
};

export function CaseFlowIcon({ id }: { readonly id: CaseFlowIconId }) {
  const icon = ICONS[id];
  return (
    <svg className="case-flow-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path className="case-flow-icon__detail" d={icon.detail} />
      <path d={icon.outline} />
    </svg>
  );
}
