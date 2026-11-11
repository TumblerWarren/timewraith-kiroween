import { CASE_MODES, type CaseModeId } from "../../content/modes";
import { FORM_LABELS } from "../../content/form";
import { ModeShape } from "../library/ModeShape";

export interface ModeFieldProps {
  readonly value: string;
  readonly onChange: (mode: CaseModeId) => void;
}

/**
 * Case mode: one native radio group with a one-line description under each option, linked by
 * `aria-describedby` (Requirement 19.4). Each option carries its mode shape, as on the case cards.
 */
export function ModeField({ value, onChange }: ModeFieldProps) {
  return (
    <fieldset className="field-group" data-field="mode">
      <legend className="field__label">{FORM_LABELS.mode}</legend>
      <div className="choice-stack">
        {CASE_MODES.map((m) => (
          <label key={m.id} className="choice choice--described" data-mode={m.id}>
            <input
              type="radio"
              name="mode"
              id={m.id === CASE_MODES[0]?.id ? "case-form-mode" : undefined}
              value={m.id}
              checked={value === m.id}
              onChange={() => onChange(m.id)}
              aria-describedby={`case-form-mode-${m.id}-desc`}
              className="choice__control"
            />
            <span className="choice__text">
              <span className="choice__label">
                <ModeShape shape={m.shape} size={22} />
                {m.label}
              </span>
              <span id={`case-form-mode-${m.id}-desc`} className="choice__desc">
                {m.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
