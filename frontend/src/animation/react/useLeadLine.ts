import { useEffect, useState } from "react";
import { LEAD_LINE_RATIO } from "../constants";

/** Height of the band around the lead line that counts as "crossing", in % of the viewport. */
const BAND_PCT = 0.5;

/** `rootMargin` that shrinks the viewport to a thin band at the lead line (60% down). */
export function leadLineMargin(ratio = LEAD_LINE_RATIO): string {
  const top = Math.round(ratio * 1000) / 10;
  const bottom = Math.max(0, Math.round((100 - top - BAND_PCT) * 10) / 10);
  return `-${top}% 0px -${bottom}% 0px`;
}

/**
 * The `data-step` of the list item under the scroll lead line (the line the thread draws to, 60% down the
 * viewport). One IntersectionObserver on a thin band; the last item that crossed it stays active while the band
 * is in a gap between items. null until the first item crosses, and without IntersectionObserver (jsdom).
 */
export function useLeadLineStep(list: Element | null): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!list || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).pop();
        const id = hit?.target.getAttribute("data-step");
        if (id) setActive(id);
      },
      { rootMargin: leadLineMargin(), threshold: 0 },
    );
    for (const item of Array.from(list.querySelectorAll(":scope > [data-step]"))) io.observe(item);
    return () => io.disconnect();
  }, [list]);
  return active;
}
