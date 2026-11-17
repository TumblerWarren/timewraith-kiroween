import { useState, type ReactNode } from "react";

export function CaseDisclosure({ label, children, initiallyOpen = false }: {
  readonly label: string;
  readonly children: ReactNode;
  readonly initiallyOpen?: boolean;
}) {
  // Native details owns subsequent toggles. Refetching data does not reset its state.
  const [openOnMount] = useState(initiallyOpen);
  return (
    <details className="case-disclosure" open={openOnMount}>
      <summary>{label}</summary>
      <div className="case-disclosure__body">{children}</div>
    </details>
  );
}
