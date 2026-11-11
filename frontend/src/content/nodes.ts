/**
 * The seven Case Board regions and their Section_Node stamps (Requirements 1.4, 2.2; design: page structure table,
 * decision D14). The header's clock-stamp nav and the thread's nodes link to the same ids.
 * The Lost Hour stamp (01:59 -> 03:00) is a generic illustration of the failure class (decisions D1, D18).
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
  /** Visible mono stamp on the node. */
  readonly stamp: string;
  /** Stamp as spoken text (the arrow and the dot are read poorly). */
  readonly stampSpoken: string;
  readonly theme: SectionTheme;
}

export const SECTION_NODES: readonly SectionNodeDef[] = [
  { id: "open", index: 1, title: "Open a case", stamp: "23:59 · 31 Oct", stampSpoken: "23:59, 31 October", theme: "night" },
  { id: "lost-hour", index: 2, title: "The lost hour", stamp: "01:59 → 03:00", stampSpoken: "01:59 to 03:00", theme: "night" },
  { id: "library", index: 3, title: "Case library", stamp: "03:33", stampSpoken: "03:33", theme: "dusk" },
  { id: "case", index: 4, title: "Case view", stamp: "04:44", stampSpoken: "04:44", theme: "night" },
  { id: "crew", index: 5, title: "Crew on duty", stamp: "05:15", stampSpoken: "05:15", theme: "dusk" },
  { id: "flow", index: 6, title: "How a case runs", stamp: "06:00", stampSpoken: "06:00", theme: "night" },
  { id: "close", index: 7, title: "Closing", stamp: "06:58", stampSpoken: "06:58", theme: "dawn" },
];

export function nodeAriaLabel(node: SectionNodeDef): string {
  return `Region ${node.index} of ${SECTION_NODES.length}: ${node.title}, ${node.stampSpoken}`;
}
