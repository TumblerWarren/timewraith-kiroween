/**
 * Animation hook points for the case UI. HOOK POINTS: a later task replaces these no-ops.
 *
 * The parallel animation task wires them to the MotionDirector (`useBatBurst()` and `useEffectTrigger` in
 * `src/animation/react/`). Until then they do nothing, so every case action works without animation and the
 * board's settle state is the static layout. Callers already pass the element the effect should start from.
 *
 * | Function          | Director request        | Called from                                  | Task  |
 * |-------------------|-------------------------|----------------------------------------------|-------|
 * | onSubmitBurst     | `bats.burst`            | form submit, origin = the submit button      | 12.5  |
 * | onDraftCreated    | `case.draft-create`     | after the new draft card is focused          | 14.2  |
 * | onCaseOpened      | `case.open`             | after a card's "Open case" swaps the case    | 14.2  |
 * | onCardsEnter      | `cases.enter`           | when the library's cards first mount         | 14.2  |
 * | onTextInputFocus  | `suppressed.input` flag | focus / blur of a text input in the form     | 12.4  |
 *
 * Reduce Motion: the director owns the fallbacks; these hooks must not move focus or scroll.
 */
export interface CaseMotionHooks {
  /** Bat Burst from the submit button (Requirement 20.1). */
  onSubmitBurst(el: HTMLElement | null): void;
  /** The new draft's card has been added, scrolled into view and focused. */
  onDraftCreated(el: HTMLElement | null): void;
  /** The case view now shows the case opened from this card (`el` is the card). */
  onCaseOpened(el: HTMLElement | null): void;
  /** The library's cards entered (first mount, samples then drafts). */
  onCardsEnter(els: readonly HTMLElement[]): void;
  /** A form text input gained (true) or lost (false) focus: the director sets `suppressed.input`. */
  onTextInputFocus(focused: boolean): void;
}

const noop = () => undefined;

/** The active hooks. `setCaseMotionHooks` lets the animation task swap them without editing the case UI. */
let hooks: CaseMotionHooks = {
  onSubmitBurst: noop,
  onDraftCreated: noop,
  onCaseOpened: noop,
  onCardsEnter: noop,
  onTextInputFocus: noop,
};

export function setCaseMotionHooks(next: Partial<CaseMotionHooks>): () => void {
  const previous = hooks;
  hooks = { ...hooks, ...next };
  return () => {
    hooks = previous;
  };
}

export const onSubmitBurst = (el: HTMLElement | null) => hooks.onSubmitBurst(el);
export const onDraftCreated = (el: HTMLElement | null) => hooks.onDraftCreated(el);
export const onCaseOpened = (el: HTMLElement | null) => hooks.onCaseOpened(el);
export const onCardsEnter = (els: readonly HTMLElement[]) => hooks.onCardsEnter(els);
export const onTextInputFocus = (focused: boolean) => hooks.onTextInputFocus(focused);
