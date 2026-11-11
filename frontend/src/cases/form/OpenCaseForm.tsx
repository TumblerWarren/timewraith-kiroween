import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { DRAFT_NOT_RUN } from "../../content/copy";
import { FORM_HINTS, FORM_LABELS, FORM_LIMIT_REACHED, FORM_SUBMIT } from "../../content/form";
import { CASE_MODE_BY_ID, type CaseModeId } from "../../content/modes";
import { useCaseActions } from "../actions";
import { onTextInputFocus } from "../motionHooks";
import { ErrorSummary } from "./ErrorSummary";
import { ModeField } from "./ModeField";
import { TargetFields } from "./TargetFields";
import { TextField } from "./TextField";
import {
  DEFAULT_VALUES,
  MAX_AREA_LENGTH,
  validate,
  validateField,
  visibleFields,
  type FieldErrors,
  type FieldId,
  type FormValues,
} from "./validate";

const DRAFT_NOTE_ID = "case-form-draft-note";

/**
 * Open_Case_Form (Requirements 19.1 to 19.17, 20.1, 20.8, 20.10).
 *
 * Native fieldsets and radio groups, visible labels and hints. A field validates on blur when its value changed;
 * submit validates every visible field. A failed submit shows the error summary and moves focus to it, keeping every
 * value. A valid submit creates a Draft_Case in this browser only (no fetch, no ping, no prefetch of the entered
 * addresses), announces "Draft case created, not run", resets the form and moves focus to the new card. At 20 drafts
 * it shows the limit message and creates nothing. `noValidate` keeps the browser's own bubbles out of the way, so
 * every error uses the same accessible pattern.
 */
export function OpenCaseForm() {
  const { submitDraft, store } = useCaseActions();
  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [limitShown, setLimitShown] = useState(false);
  const focusValue = useRef<Partial<Record<FieldId, string>>>({});
  const summaryRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const visible = visibleFields(values);
  const shownErrors: FieldErrors = Object.fromEntries(visible.filter((id) => errors[id]).map((id) => [id, errors[id]]));
  const needsIssue = CASE_MODE_BY_ID[values.mode as CaseModeId]?.needsIssue ?? true;

  const setValue = (id: FieldId, value: string) => setValues((v) => ({ ...v, [id]: value }));

  const handlers = {
    onChange: setValue,
    onFocus: (id: FieldId, value: string) => {
      focusValue.current[id] = value;
      // HOOK POINT (task 12.4): the director sets `suppressed.input` while a text input has focus.
      onTextInputFocus(true);
    },
    onBlur: (id: FieldId, value: string) => {
      onTextInputFocus(false);
      if (focusValue.current[id] === value) return;
      const next = { ...values, [id]: value };
      const error = validateField(id, next);
      setErrors((e) => {
        const copy = { ...e };
        if (error) copy[id] = error;
        else delete copy[id];
        return copy;
      });
    },
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = validate(values);
    if (!result.ok) {
      flushSync(() => {
        setErrors(result.errors);
        setSummaryOpen(true);
        setLimitShown(false);
      });
      summaryRef.current?.focus();
      return;
    }
    if (store.limitReached) {
      setErrors({});
      setSummaryOpen(false);
      setLimitShown(true);
      return;
    }
    // HOOK POINTS (tasks 12.5, 14.2): `bats.burst` from the submit button and `case.draft-create` fire inside
    // submitDraft through cases/motionHooks.ts.
    const outcome = submitDraft(result.draft, submitRef.current);
    if (!outcome.ok) {
      setLimitShown(true);
      return;
    }
    setValues(DEFAULT_VALUES);
    setErrors({});
    setSummaryOpen(false);
    setLimitShown(false);
    focusValue.current = {};
  };

  return (
    <form className="case-form" aria-labelledby="open-case-title" noValidate onSubmit={onSubmit} data-form="open-case">
      {summaryOpen ? <ErrorSummary ref={summaryRef} errors={shownErrors} order={visible} /> : null}

      <TargetFields
        values={values}
        errors={shownErrors}
        onTargetType={(t) => setValues((v) => ({ ...v, targetType: t }))}
        {...handlers}
      />

      <TextField
        id="area"
        multiline
        maxLength={MAX_AREA_LENGTH}
        label={FORM_LABELS.area}
        hint={FORM_HINTS.area}
        value={values.area}
        error={shownErrors.area}
        {...handlers}
      />

      <ModeField value={values.mode} onChange={(m) => setValues((v) => ({ ...v, mode: m }))} />

      {needsIssue ? (
        <TextField
          id="issueUrl"
          type="url"
          inputMode="url"
          label={FORM_LABELS.issueUrl}
          hint={values.mode === "blind-hunt" ? FORM_HINTS.issueUrlBlind : FORM_HINTS.issueUrl}
          value={values.issueUrl}
          error={shownErrors.issueUrl}
          {...handlers}
        />
      ) : null}

      {limitShown ? (
        <p className="case-form__limit" role="alert">
          {FORM_LIMIT_REACHED}
        </p>
      ) : null}

      <div className="case-form__submit">
        <button ref={submitRef} type="submit" className="btn btn--primary case-form__button" aria-describedby={DRAFT_NOTE_ID}>
          {FORM_SUBMIT}
        </button>
        <p id={DRAFT_NOTE_ID} className="case-form__draft-note">
          {DRAFT_NOT_RUN}
        </p>
      </div>
    </form>
  );
}
