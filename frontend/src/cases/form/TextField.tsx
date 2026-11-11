import type { ChangeEvent, FocusEvent, InputHTMLAttributes } from "react";
import type { FieldId } from "./validate";

/** DOM ids of a field, its hint and its error (the error summary links to `fieldId`). */
export const fieldId = (id: FieldId) => `case-form-${id}`;
export const hintId = (id: FieldId) => `case-form-${id}-hint`;
export const errorId = (id: FieldId) => `case-form-${id}-error`;

export interface FieldHandlers {
  readonly onChange: (id: FieldId, value: string) => void;
  readonly onFocus: (id: FieldId, value: string) => void;
  readonly onBlur: (id: FieldId, value: string) => void;
}

export interface TextFieldProps extends FieldHandlers {
  readonly id: FieldId;
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly error?: string;
  readonly multiline?: boolean;
  readonly maxLength?: number;
  readonly type?: "url" | "text";
  readonly inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}

/** The error line: an ink "!" marker plus the sentence, so it is never color-only (brick-700 on paper-100). */
export function FieldError({ id, message }: { id: FieldId; message?: string }) {
  if (!message) return null;
  return (
    <p id={errorId(id)} className="field__error">
      <span className="field__error-mark" aria-hidden="true">
        !
      </span>
      <span className="visually-hidden">Error: </span>
      {message}
    </p>
  );
}

/**
 * One labelled text control (visible label, hint, error). `aria-invalid` and `aria-describedby` follow the error.
 * The value is always a React text value, never HTML (Requirement 19.16).
 */
export function TextField({
  id,
  label,
  hint,
  value,
  error,
  multiline = false,
  maxLength,
  type = "text",
  inputMode,
  onChange,
  onFocus,
  onBlur,
}: TextFieldProps) {
  const describedBy = [hint ? hintId(id) : null, error ? errorId(id) : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id: fieldId(id),
    name: id,
    value,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy,
    autoComplete: "off",
    spellCheck: false,
    maxLength,
    className: multiline ? "field__control field__control--area" : "field__control",
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(id, e.target.value),
    onFocus: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => onFocus(id, e.target.value),
    onBlur: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => onBlur(id, e.target.value),
  };
  return (
    <div className={error ? "field field--invalid" : "field"} data-field={id}>
      <label className="field__label" htmlFor={fieldId(id)}>
        {label}
      </label>
      {hint ? (
        <p id={hintId(id)} className="field__hint">
          {hint}
        </p>
      ) : null}
      {multiline ? <textarea rows={2} {...common} /> : <input type={type} inputMode={inputMode} {...common} />}
      <FieldError id={id} message={error} />
    </div>
  );
}
