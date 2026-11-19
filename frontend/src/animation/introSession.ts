type IntroPage = "landing" | "new" | "crew" | "cases";

const seen = new Set<IntroPage>();
const key = (page: IntroPage) => `tw:intro-seen:${page}`;

export function hasSeenIntro(page: IntroPage): boolean {
  if (seen.has(page)) return true;
  try {
    return sessionStorage.getItem(key(page)) === "1";
  } catch {
    return false;
  }
}

export function markIntroSeen(page: IntroPage): void {
  seen.add(page);
  try {
    sessionStorage.setItem(key(page), "1");
  } catch {
    // The in-memory record still covers navigation in this document.
  }
}
