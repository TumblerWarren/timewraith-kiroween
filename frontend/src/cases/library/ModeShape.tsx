import type { CaseModeDef } from "../../content/modes";

/**
 * Case_Mode shapes (design: Case library), so the mode is never told by color alone: Known issue = open book,
 * Blind hunt = blindfold band, Open hunt = lantern. Ink on paper; decorative, the label is always printed beside it.
 */
export function ModeShape({ shape, size = 24 }: { shape: CaseModeDef["shape"]; size?: number }) {
  return (
    <svg className="mode-shape" data-shape={shape} viewBox="0 0 32 32" width={size} height={size} focusable="false" aria-hidden="true">
      {shape === "book" ? (
        <>
          <path d="M16 9 C12 6.5 7 6.5 3.5 8 L3.5 25 C7 23.5 12 23.5 16 26 C20 23.5 25 23.5 28.5 25 L28.5 8 C25 6.5 20 6.5 16 9 Z" fill="var(--paper-100)" stroke="var(--ink-900)" strokeWidth={2.2} strokeLinejoin="round" />
          <path d="M16 9 L16 26" stroke="var(--ink-900)" strokeWidth={2} />
          <path d="M6.5 12 C9 11.2 11.5 11.4 13.5 12.4 M6.5 16 C9 15.2 11.5 15.4 13.5 16.4 M18.5 12.4 C20.5 11.4 23 11.2 25.5 12" stroke="var(--walnut-700)" strokeWidth={1.5} fill="none" strokeLinecap="round" />
        </>
      ) : null}
      {shape === "blindfold" ? (
        <>
          <path d="M2.5 13 C10 10.5 22 10.5 29.5 13 L29.5 19 C22 21.5 10 21.5 2.5 19 Z" fill="var(--ink-900)" stroke="var(--ink-900)" strokeWidth={2} strokeLinejoin="round" />
          <path d="M24 19.5 C25 23 27 25.5 29.5 27 M21 20 C21.5 23.5 22.5 26 24.5 28.5" stroke="var(--ink-900)" strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <path d="M8 15.6 C9.5 14.8 11.5 14.8 13 15.6 M19 15.6 C20.5 14.8 22.5 14.8 24 15.6" stroke="var(--paper-100)" strokeWidth={1.5} fill="none" strokeLinecap="round" />
        </>
      ) : null}
      {shape === "lantern" ? (
        <>
          <path d="M12.5 6 C12.5 3 19.5 3 19.5 6" stroke="var(--ink-900)" strokeWidth={2} fill="none" strokeLinecap="round" />
          <path d="M10 7 L22 7 L23.5 10 L8.5 10 Z" fill="var(--ink-900)" />
          <path d="M9.5 10 L22.5 10 L21.5 25 L10.5 25 Z" fill="var(--paper-100)" stroke="var(--ink-900)" strokeWidth={2.2} strokeLinejoin="round" />
          <path d="M16 14 C18.5 16.5 18.5 20 16 21.5 C13.5 20 13.5 16.5 16 14 Z" fill="var(--pumpkin-600)" stroke="var(--ink-900)" strokeWidth={1.2} />
          <path d="M8.5 25 L23.5 25 L22 28.5 L10 28.5 Z" fill="var(--ink-900)" />
        </>
      ) : null}
    </svg>
  );
}
