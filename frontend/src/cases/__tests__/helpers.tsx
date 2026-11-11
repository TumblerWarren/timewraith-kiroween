import { render } from "@testing-library/react";
import { LiveAnnouncer } from "../../a11y/LiveAnnouncer";
import { CaseLibrary } from "../library/CaseLibrary";
import { OpenCaseForm } from "../form/OpenCaseForm";
import { visibleTitle } from "../model";
import { CaseStoreProvider, useCaseStore } from "../store";
import type { StorageLike } from "../drafts/storage";

/** A fake Storage whose reads or writes can be made to throw. */
export class FakeStorage implements StorageLike {
  readonly map = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException("QuotaExceededError", "QuotaExceededError");
    this.map.set(key, value);
  }
}

/** Stand-in for the Case view heading until task 9 makes CaseView case-scoped: it shows the selected case. */
export function CaseViewProbe() {
  const { selected } = useCaseStore();
  return (
    <section id="case" aria-labelledby="case-title">
      <h2 id="case-title" tabIndex={-1} data-selected={selected.id}>
        {visibleTitle(selected)}
      </h2>
    </section>
  );
}

/** The form, the library and a Case view probe inside the providers, as on the board. */
export function renderBoard(storage: StorageLike | null = new FakeStorage(), now?: () => number) {
  return render(
    <LiveAnnouncer>
      <CaseStoreProvider storage={storage} now={now}>
        <section id="open">
          <h2 id="open-case-title">Open a new case</h2>
          <OpenCaseForm />
        </section>
        <section id="library">
          <h2 id="library-title" tabIndex={-1}>
            Case library
          </h2>
          <CaseLibrary />
        </section>
        <CaseViewProbe />
      </CaseStoreProvider>
    </LiveAnnouncer>,
  );
}
