import { forwardRef, type MouseEvent } from "react";
import { FORM_LABELS, FORM_SUMMARY_HEADING } from "../../content/form";
import { fieldId } from "./TextField";
import type { FieldErrors, FieldId } from "./validate";

export interface ErrorSummaryProps {
  readonly errors: FieldErrors;
  /** Visible fields in form order; the list follows it. */
  readonly order: readonly FieldId[];
}

/**
 * Error summary (Requirement 19.13): an alert region with `tabindex="-1"` that receives focus after a failed
 * submit and lists each error as a link to its field. The links move focus with script and prevent the default
 * jump, so the URL never changes.
 */
export const ErrorSummary = forwardRef<HTMLDivElement, ErrorSummaryProps>(function ErrorSummary({ errors, order }, ref) {
  const items = order.filter((id) => errors[id]);
  if (items.length === 0) return null;
  const go = (id: FieldId) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const el = e.currentTarget.ownerDocument.getElementById(fieldId(id));
    el?.focus();
  };
  return (
    <div ref={ref} className="error-summary" role="alert" tabIndex={-1} aria-labelledby="case-form-summary-title">
      <h3 id="case-form-summary-title" className="error-summary__title">
        {FORM_SUMMARY_HEADING}
      </h3>
      <ul className="error-summary__list">
        {items.map((id) => (
          <li key={id}>
            <a href={`#${fieldId(id)}`} onClick={go(id)}>
              <span className="error-summary__field">{FORM_LABELS[id]}</span>: {errors[id]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});
