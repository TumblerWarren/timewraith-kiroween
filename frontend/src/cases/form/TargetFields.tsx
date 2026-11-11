import { FORM_HINTS, FORM_LABELS } from "../../content/form";
import { TextField, type FieldHandlers } from "./TextField";
import type { FieldErrors, FormValues } from "./validate";

export interface TargetFieldsProps extends FieldHandlers {
  readonly values: FormValues;
  readonly errors: FieldErrors;
  readonly onTargetType: (value: "repository" | "local-app") => void;
}

const TARGET_OPTIONS = [
  { value: "repository", label: FORM_LABELS.targetRepository },
  { value: "local-app", label: FORM_LABELS.targetLocal },
] as const;

/**
 * Target type (a native radio group, arrow keys move between options) and the fields it shows: repository URL and
 * version for a Git repository, the local app URL for a local app (Requirements 19.2, 19.3, 19.15). Hidden fields are
 * not rendered, so they cannot be focused or announced.
 */
export function TargetFields({ values, errors, onTargetType, ...handlers }: TargetFieldsProps) {
  const isLocal = values.targetType === "local-app";
  return (
    <>
      <fieldset className="field-group" data-field="targetType">
        <legend className="field__label">{FORM_LABELS.targetType}</legend>
        <div className="choice-row">
          {TARGET_OPTIONS.map((o) => (
            <label key={o.value} className="choice">
              <input
                type="radio"
                name="targetType"
                id={o.value === "repository" ? "case-form-targetType" : undefined}
                value={o.value}
                checked={values.targetType === o.value}
                onChange={() => onTargetType(o.value)}
                className="choice__control"
              />
              <span className="choice__label">{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {isLocal ? (
        <TextField
          id="appUrl"
          type="url"
          inputMode="url"
          label={FORM_LABELS.appUrl}
          hint={FORM_HINTS.appUrl}
          value={values.appUrl}
          error={errors.appUrl}
          {...handlers}
        />
      ) : (
        <>
          <TextField
            id="repoUrl"
            type="url"
            inputMode="url"
            label={FORM_LABELS.repoUrl}
            hint={FORM_HINTS.repoUrl}
            value={values.repoUrl}
            error={errors.repoUrl}
            {...handlers}
          />
          <TextField
            id="version"
            label={FORM_LABELS.version}
            hint={FORM_HINTS.version}
            value={values.version}
            error={errors.version}
            {...handlers}
          />
        </>
      )}
    </>
  );
}
