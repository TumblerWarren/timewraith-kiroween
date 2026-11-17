import type { Contribution } from "../../api/types";
import { CONTRIBUTION as copy } from "../../content/copy";
import { CaseDisclosure } from "./CaseDisclosure";

export function ContributionReview({ contribution }: { readonly contribution: Contribution }) {
  const { checks, notes, rules } = contribution;
  const guide = rules.contributing_url;
  const requirements = [
    rules.archived && copy.archived,
    rules.conventional_commits && copy.conventional,
    rules.dco && copy.dco,
    rules.cla && copy.cla,
  ].filter(Boolean);

  return (
    <div className="case-contribution">
      <h6>{copy.checks}</h6>
      {checks.length ? (
        <ul role="list" className="case-contribution__checks">
          {checks.map((check) => {
            const label = check.passed ? copy.passed : check.preexisting ? copy.preexisting : copy.failed;
            const tone = check.passed ? "tag--good" : check.preexisting ? "tag--warn" : "tag--bad";
            return (
              <li key={check.name}>
                <div className="case-card__head"><strong>{check.name}</strong><span className={`tag ${tone}`}>{label}</span></div>
                {check.command && <code className="case-note mono">{check.command}</code>}
                {check.detail && <pre className="code mono">{check.detail}</pre>}
              </li>
            );
          })}
        </ul>
      ) : <p className="case-note">{copy.noChecks}</p>}
      {(contribution.rebased || notes.length > 0) && (
        <CaseDisclosure label={copy.notes} initiallyOpen>
          <ul role="list" className="case-share__problems">
            {contribution.rebased && <li>{copy.rebased}</li>}
            {notes.map((note, i) => <li key={i}>{note}</li>)}
          </ul>
        </CaseDisclosure>
      )}
      <CaseDisclosure label={copy.rules}>
        <dl className="facts">
          {rules.default_branch && <div><dt>{copy.defaultBranch}</dt><dd className="mono">{rules.default_branch}</dd></div>}
          <div><dt>{copy.base}</dt><dd className="mono" title={contribution.base}>{contribution.base.slice(0, 12)}</dd></div>
          {guide && <div><dt>{copy.guide}</dt><dd>{/^https:\/\/github\.com\//.test(guide)
            ? <a href={guide} target="_blank" rel="noreferrer">{guide}</a> : guide}</dd></div>}
          {rules.template_path && <div><dt>{copy.template}</dt><dd className="mono">{rules.template_path}</dd></div>}
          {rules.test_dir && <div><dt>{copy.testDirectory}</dt><dd className="mono">{rules.test_dir}</dd></div>}
          {rules.test_pattern && <div><dt>{copy.testPattern}</dt><dd className="mono">{rules.test_pattern}</dd></div>}
          {contribution.test_path && <div><dt>{copy.test}</dt><dd className="mono">{contribution.test_path}</dd></div>}
          {rules.scripts.length > 0 && <div><dt>{copy.scripts}</dt><dd className="mono">{rules.scripts.join(", ")}</dd></div>}
          {rules.ai_policy.length > 0 && <div><dt>{copy.aiPolicy}</dt><dd><ul role="list">
            {rules.ai_policy.map((line, i) => <li key={i}>{line}</li>)}
          </ul></dd></div>}
        </dl>
        {requirements.length > 0 && <ul role="list" className="case-share__problems">
          {requirements.map((rule) => <li key={String(rule)}>{rule}</li>)}
        </ul>}
      </CaseDisclosure>
    </div>
  );
}
