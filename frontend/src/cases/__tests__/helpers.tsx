import { render } from "@testing-library/react";
import { LiveAnnouncer } from "../../a11y/LiveAnnouncer";
import { CaseRows } from "../../pages/CaseRows";
import { OpenCaseForm } from "../form/OpenCaseForm";
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

/** Every case in the store as rows, as on the Cases page. */
export function CaseList() {
  const { cases } = useCaseStore();
  return <CaseRows cases={cases} />;
}

/** The form and the case list inside the providers. */
export function renderBoard(storage: StorageLike | null = new FakeStorage(), now?: () => number) {
  return render(
    <LiveAnnouncer>
      <CaseStoreProvider storage={storage} now={now}>
        <h1 id="open-case-title">Open a case</h1>
        <OpenCaseForm />
        <CaseList />
      </CaseStoreProvider>
    </LiveAnnouncer>,
  );
}
