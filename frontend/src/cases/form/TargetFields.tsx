import { FORM_HINTS, FORM_LABELS } from "../../content/form";
import { TextField, type FieldHandlers } from "./TextField";
import type { FieldErrors, FormValues } from "./validate";

export interface TargetFieldsProps extends FieldHandlers {
  readonly values: FormValues;
  readonly errors: FieldErrors;
}

/** The target: a public GitHub repository and the tag, branch or commit to pin it to. */
export function TargetFields({ values, errors, ...handlers }: TargetFieldsProps) {
  return (
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
  );
}
