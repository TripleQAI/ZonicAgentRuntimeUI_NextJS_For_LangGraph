'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { t } from '@/lib/i18n/t';
import {
  fieldsOf,
  initialValues,
  isApprovalSchema,
  readForm,
  serverErrors,
  type FieldSpec,
  type JsonSchema,
} from '@/lib/schema-form';
import type { RunErrorInfo } from '@/store/run';
import { MarkdownText } from '@/components/content/renderers/MarkdownRenderer';

export interface InterruptRequest {
  interruptId: string;
  kind: string;
  prompt?: string;
  schema: Record<string, unknown>;
  expiresAt?: string;
}

export interface InterruptFormProps {
  interrupt: InterruptRequest;
  /** Sends the answer; resolves with the runtime's refusal, if any. */
  onSubmit(answer: unknown): Promise<RunErrorInfo | undefined>;
  /** Moves focus to the form when it appears (a run just paused for input). */
  autoFocus?: boolean;
}

const inputClass = 'field mt-1';

/**
 * A human-input or approval form generated from the interrupt's answer schema (task U5-06, case
 * U-07): an approval (`approved: boolean`) gets Approve and Reject with an optional comment; any
 * other schema gets one input per property. Errors show beside their field, from the form's own
 * checks and from the runtime's answer validation, and the run resumes in stream mode.
 */
export function InterruptForm({ interrupt, onSubmit, autoFocus = false }: InterruptFormProps) {
  const schema = interrupt.schema as JsonSchema;
  const approval = isApprovalSchema(schema);
  const fields = useMemo(
    () => fieldsOf(schema).filter((field) => !(approval && field.name === 'approved')),
    [schema, approval],
  );
  const [inputs, setInputs] = useState(() => initialValues(fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    if (autoFocus) heading.current?.focus();
  }, [autoFocus]);

  const send = async (extra: Record<string, unknown>) => {
    const { value, errors: found } = readForm(fields, inputs);
    setErrors(found);
    setFormError(undefined);
    if (Object.keys(found).length > 0) {
      document.getElementById(`${id}-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    const refusal = await onSubmit({ ...value, ...extra });
    setBusy(false);
    if (!refusal) return;
    const { byField, other } = serverErrors(fields, refusal.details ?? []);
    setErrors(byField);
    setFormError(other.length > 0 ? other.join(' ') : Object.keys(byField).length > 0 ? undefined : refusal.message);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!approval) void send({});
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="my-3 rounded-md border-l-4 border-tq-amber bg-surface p-4 shadow-md"
    >
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="text-base font-semibold">
        {approval ? t('interrupt.approvalTitle') : t('interrupt.inputTitle')}
      </h2>
      {interrupt.prompt && <MarkdownText text={interrupt.prompt} />}
      {interrupt.expiresAt && (
        <p className="mt-1 text-xs text-muted">
          {t('interrupt.expires', { time: new Date(interrupt.expiresAt).toLocaleString() })}
        </p>
      )}
      {fields.map((field) => (
        <Field
          key={field.name}
          id={`${id}-${field.name}`}
          field={field}
          value={inputs[field.name] ?? ''}
          error={errors[field.name]}
          onChange={(value) => setInputs((current) => ({ ...current, [field.name]: value }))}
        />
      ))}
      {formError && (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger">
          {formError}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {approval ? (
          <>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void send({ approved: true })}>
              {t('interrupt.approve')}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void send({ approved: false })}>
              {t('interrupt.reject')}
            </button>
          </>
        ) : (
          <button type="submit" className="btn-primary" disabled={busy}>
            {t('interrupt.submit')}
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  id,
  field,
  value,
  error,
  onChange,
}: {
  id: string;
  field: FieldSpec;
  value: string | boolean;
  error?: string;
  onChange(value: string | boolean): void;
}) {
  const described = [field.description ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  const common = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': described || undefined,
    'aria-required': field.required || undefined,
  } as const;
  const label = (
    <label htmlFor={id} className="block text-sm font-semibold">
      {field.label}
      {field.required && <span aria-hidden> *</span>}
    </label>
  );
  return (
    <div className="mt-3">
      {field.kind === 'boolean' ? (
        <div className="flex items-center gap-2">
          <input
            {...common}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
            className="h-4 w-4"
          />
          {label}
        </div>
      ) : (
        <>
          {label}
          {field.kind === 'choice' ? (
            <select {...common} value={String(value)} onChange={(event) => onChange(event.target.value)} className={inputClass}>
              <option value="">{t('form.choose')}</option>
              {field.choices?.map((choice) => (
                <option key={String(choice)} value={String(choice)}>
                  {String(choice)}
                </option>
              ))}
            </select>
          ) : field.kind === 'longText' || field.kind === 'json' ? (
            <textarea
              {...common}
              rows={field.kind === 'json' ? 4 : 3}
              value={String(value)}
              onChange={(event) => onChange(event.target.value)}
              className={inputClass}
            />
          ) : (
            <input
              {...common}
              type="text"
              inputMode={field.kind === 'number' ? 'decimal' : field.kind === 'integer' ? 'numeric' : undefined}
              value={String(value)}
              onChange={(event) => onChange(event.target.value)}
              className={inputClass}
            />
          )}
        </>
      )}
      {field.description && (
        <p id={`${id}-help`} className="mt-1 text-xs text-muted">
          {field.description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
