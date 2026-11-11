import { useEffect, useRef } from "react";
import { useCaseActions } from "../actions";
import { onCardsEnter } from "../motionHooks";
import { CaseCard } from "./CaseCard";

/** The library heading, which takes focus after a draft is removed (its card and button are gone). */
export const LIBRARY_HEADING_ID = "library-title";

/**
 * Case_Library (Requirements 21.1 to 21.7, 20.5, 20.9): an `<ol>` along the thread, the two samples first, then the
 * drafts newest first. Each `<li>` keeps the `data-case-id` hook. Exactly one card is current. Opening a card swaps
 * the Case view without changing the URL; removing the open draft selects FullCalendar #7998 again.
 */
export function CaseLibrary() {
  const { openCase, removeDraft, store } = useCaseActions();
  const listRef = useRef<HTMLOListElement>(null);

  // HOOK POINT (task 14.2): `cases.enter` when the cards first mount.
  useEffect(() => {
    const cards = Array.from(listRef.current?.querySelectorAll<HTMLElement>(".case-card") ?? []);
    onCardsEnter(cards);
  }, []);

  const remove = (id: string) => {
    removeDraft(id);
    listRef.current?.ownerDocument.getElementById(LIBRARY_HEADING_ID)?.focus();
  };

  return (
    <ol ref={listRef} className="library__cards" role="list" data-library="cards">
      {store.cases.map((c, i) => (
        <li key={c.id} className="library__item" data-case-id={c.id} data-case-kind={c.kind} data-side={i % 2 === 0 ? "start" : "end"}>
          <CaseCard c={c} current={c.id === store.selectedId} onOpen={openCase} onRemove={c.kind === "draft" ? remove : undefined} />
        </li>
      ))}
    </ol>
  );
}
