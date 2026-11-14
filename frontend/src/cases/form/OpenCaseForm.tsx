import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useApi } from "../../api/ApiProvider";
import { ApiError } from "../../api/client";
import { FORM_HINTS, FORM_LABELS, FORM_LIMIT_REACHED, FORM_NOTE_OFFLINE, FORM_NOTE_ONLINE, FORM_SUBMIT } from "../../content/form";
import { CASE_MODE_BY_ID, type CaseModeId } from "../../content/modes";
import { useCaseActions } from "../actions";
import { ErrorSummary } from "./ErrorSummary";
import { ModeField } from "./ModeField";
import { TargetFields } from "./TargetFields";
import { TextField } from "./TextField";
import { DEFAULT_VALUES, MAX_AREA_LENGTH, validate, validateField, visibleFields, type FieldErrors, type FieldId, type FormValues } from "./validate";

const NOTE_ID = "case-form-submit-note";
const AUTO_ID = "case-form-auto";

/**
 * Open_Case_Form. Native fieldsets and radio groups, visible labels and hints. A field validates on blur when its
 * value changed; submit validates every visible field, and a failed submit shows the error summary and moves focus
 * to it, keeping every value.
 *
 * A valid submit starts a real investigation when the backend is online (`POST /investigations`) and opens it in
 * the Case view. When the backend is offline the case is saved as a draft in this browser instead, with a
 * "Run this draft" button for later. A backend error keeps the values and shows the backend's message.
 */
export interface OpenCaseFormProps {
  /** Prefilled values, e.g. "Retry with main" after a ref was not found. */
  readonly initial?: Partial<FormValues>;
  /** Id of the heading that names the form. */
  readonly labelledBy?: string;
}

export function OpenCaseForm({ initial, labelledBy = "open-case-title" }: OpenCaseFormProps = {}) {
  const { submitDraft, startCase, store } = useCaseActions();
  const { online } = useApi();
  const [values, setValues] = useState<FormValues>(() => ({ ...DEFAULT_VALUES, ...initial }));
  const [auto, setAuto] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [limitShown, setLimitShown] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    },
    onBlur: (id: FieldId, value: string) => {
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

  const reset = () => {
    setValues(DEFAULT_VALUES);
    setErrors({});
    setSummaryOpen(false);
    setLimitShown(false);
    setServerError(null);
    focusValue.current = {};
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const result = validate(values);
    if (!result.ok) {
      flushSync(() => {
        setErrors(result.errors);
        setSummaryOpen(true);
        setLimitShown(false);
        setServerError(null);
      });
      summaryRef.current?.focus();
      return;
    }
    if (online) {
      setBusy(true);
      try {
        await startCase(result.draft, auto);
        reset();
      } catch (err) {
        setServerError(err instanceof ApiError ? err.message : "The backend could not start the investigation.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (store.limitReached) {
      setErrors({});
      setSummaryOpen(false);
      setLimitShown(true);
      return;
    }
    const outcome = submitDraft(result.draft);
    if (!outcome.ok) {
      setLimitShown(true);
      return;
    }
    reset();
  };

  return (
    <form className="case-form" aria-labelledby={labelledBy} noValidate onSubmit={onSubmit} data-form="open-case" aria-busy={busy}>
      {summaryOpen ? <ErrorSummary ref={summaryRef} errors={shownErrors} order={visible} /> : null}

      <TargetFields values={values} errors={shownErrors} {...handlers} />

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

      <div className="field case-form__auto">
        <label className="choice" htmlFor={AUTO_ID}>
          <input
            id={AUTO_ID}
            type="checkbox"
            className="choice__control"
            checked={auto}
            onChange={(ev) => setAuto(ev.currentTarget.checked)}
            aria-describedby={`${AUTO_ID}-hint`}
          />
          <span className="choice__label">{FORM_LABELS.auto}</span>
        </label>
        <p id={`${AUTO_ID}-hint`} className="field__hint">
          {FORM_HINTS.auto}
        </p>
      </div>

      {limitShown ? (
        <p className="case-form__limit" role="alert">
          {FORM_LIMIT_REACHED}
        </p>
      ) : null}
      {serverError ? (
        <p className="case-form__limit" role="alert">
          {serverError}
        </p>
      ) : null}

      <div className="case-form__submit">
        <button ref={submitRef} type="submit" className="btn btn--primary case-form__button" aria-describedby={NOTE_ID} disabled={busy}>
          {FORM_SUBMIT}
        </button>
        <p id={NOTE_ID} className="case-form__draft-note">
          {online ? FORM_NOTE_ONLINE : FORM_NOTE_OFFLINE}
        </p>
      </div>
    </form>
  );
}
