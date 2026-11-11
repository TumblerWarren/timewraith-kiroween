import { CTA_DEMO, CTA_GITHUB } from "../content/copy";

/**
 * Placeholder_Links live in this one file (Requirement 5.7).
 *
 * `demo` and `github` stay `placeholder: true` until task 22.3 swaps in real URLs.
 * A placeholder link renders a footnote dagger after its text and one shared footnote under the links.
 *
 * Suggested final values (design decision D11, to be confirmed by the user):
 * - github.href -> public repository `https://github.com/<user>/timewraith`
 * - demo.href   -> a public YouTube video of under 3 minutes. The 2026 rules require the
 *                  demo video to be PUBLIC on YouTube, not unlisted.
 * - Optional: a live deploy of the static build on Cloudflare Pages or Vercel.
 * When swapping, set `placeholder: false` on both entries.
 */
export interface SiteLink {
  readonly label?: string;
  readonly href: string;
  readonly placeholder: boolean;
}

export const LINKS = {
  demo: {
    label: CTA_DEMO,
    href: "https://example.com/TODO-replace-demo-link",
    placeholder: true,
  },
  github: {
    label: CTA_GITHUB,
    href: "https://example.com/TODO-replace-github-link",
    placeholder: true,
  },
  issue7998: {
    href: "https://github.com/fullcalendar/fullcalendar/issues/7998",
    placeholder: false,
  },
  // Source of the Blind hunt sample case. Never shown before that case's reveal event.
  issue30021: {
    href: "https://github.com/calcom/cal.com/issues/30021",
    placeholder: false,
  },
  playwrightClock: {
    href: "https://playwright.dev/docs/clock",
    placeholder: false,
  },
  kiroween: {
    href: "https://kiroween.devpost.com/",
    placeholder: false,
  },
  // Verified to resolve in task 2.5.
  kiroCrew: {
    href: "https://github.com/kirodotdev/KiroCrew",
    placeholder: false,
  },
} as const satisfies Record<string, SiteLink>;

export type LinkKey = keyof typeof LINKS;
