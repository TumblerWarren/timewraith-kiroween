import type { Bug } from "../../api/types";
import { CASE_ADDITIONS } from "../../content/copy";
import { CaseDisclosure } from "./CaseDisclosure";

export function BugReproduction({ bug }: { readonly bug: Bug }) {
  const reproduction = bug.reproduction;
  if (!reproduction) return null;
  const copy = CASE_ADDITIONS.reproduction;
  const controlLabels: Record<string, string> = {
    retry_cancelled: "Uncancelled retry control",
    expiry_deadline: "Expiry boundary control",
    elapsed_clock_jump: "Unshifted clock control",
  };
  return <CaseDisclosure label={copy.title}>
    {reproduction.code && <pre className="code mono" aria-label={copy.code}><code>{reproduction.code}</code></pre>}
    <dl className="case-reproduction-points">
      {reproduction.failing && <div><dt>{copy.failing}</dt><dd className="mono">{reproduction.failing}</dd></div>}
      {reproduction.control && <div><dt>{copy.control}</dt><dd className="mono">{reproduction.control}</dd></div>}
    </dl>
    {reproduction.control_code && <div className="case-saved-summary">
      <h5>{controlLabels[bug.invariant] ?? "Timer delivery control"}</h5>
      <pre className="code mono"><code>{reproduction.control_code}</code></pre>
    </div>}
    {(reproduction.user_check || reproduction.user_failing) && <div className="case-saved-summary">
      <h5>{copy.publicApi}</h5>
      {reproduction.user_check && <pre className="code mono" aria-label={copy.userCheck}><code>{reproduction.user_check}</code></pre>}
      {reproduction.user_failing && <dl className="case-reproduction-points"><div><dt>{copy.userFailing}</dt><dd className="mono">{reproduction.user_failing}</dd></div></dl>}
    </div>}
  </CaseDisclosure>;
}
