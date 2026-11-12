/**
 * External links used on the board. Every entry is a real, published address; there are no placeholder links.
 * Add the demo video and the project repository here once they exist, and show them in the Closing and the footer.
 */
export interface SiteLink {
  readonly label?: string;
  readonly href: string;
}

export const LINKS = {
  playwrightClock: { href: "https://playwright.dev/docs/clock" },
  kiroween: { href: "https://kiroween.devpost.com/" },
  kiroCrew: { href: "https://github.com/kirodotdev/KiroCrew" },
} as const satisfies Record<string, SiteLink>;

export type LinkKey = keyof typeof LINKS;
