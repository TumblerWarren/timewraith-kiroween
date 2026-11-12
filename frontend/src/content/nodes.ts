/**
 * The seven Case Board regions (design: page structure table, decision D14). The header nav and the thread's
 * nodes link to the same ids. The decorative clock stamps were removed: a real board shows real times only.
 */
export const SECTION_IDS = ["open", "lost-hour", "library", "case", "crew", "flow", "close"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** night = tower-950, dusk = walnut-700, dawn = moon-200 (visual revision R2). */
export type SectionTheme = "night" | "dusk" | "dawn";

export interface SectionNodeDef {
  readonly id: SectionId;
  /** 1-based position on the board. */
  readonly index: number;
  /** Short title used in navigation and in the aria-label. */
  readonly title: string;
  readonly theme: SectionTheme;
}

export const SECTION_NODES: readonly SectionNodeDef[] = [
  { id: "open", index: 1, title: "Open a case", theme: "night" },
  { id: "lost-hour", index: 2, title: "The lost hour", theme: "night" },
  { id: "library", index: 3, title: "Case library", theme: "dusk" },
  { id: "case", index: 4, title: "Case view", theme: "night" },
  { id: "crew", index: 5, title: "Crew on duty", theme: "dusk" },
  { id: "flow", index: 6, title: "How a case runs", theme: "night" },
  { id: "close", index: 7, title: "Closing", theme: "dawn" },
];

export function nodeAriaLabel(node: SectionNodeDef): string {
  return `Region ${node.index} of ${SECTION_NODES.length}: ${node.title}`;
}
