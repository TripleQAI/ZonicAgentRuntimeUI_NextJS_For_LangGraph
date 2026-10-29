import { t } from '@/lib/i18n/t';

/**
 * Forms from an interrupt's JSON Schema (design Sections 8.3 and 14.2, task U5-06): the fields of
 * the answer object, their initial values, coercion of what the user typed, and the checks the UI
 * can make before sending. The runtime validates the answer again; its errors are shown inline too.
 */
export type JsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
  items?: JsonSchema;
};

export type FieldKind = 'text' | 'longText' | 'number' | 'integer' | 'boolean' | 'choice' | 'json';

export interface FieldSpec {
  name: string;
  label: string;
  description?: string;
  kind: FieldKind;
  required: boolean;
  choices?: unknown[];
  schema: JsonSchema;
}

const typeOf = (schema: JsonSchema): string | undefined =>
  Array.isArray(schema.type) ? schema.type.find((type) => type !== 'null') : schema.type;

function kindOf(schema: JsonSchema): FieldKind {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return 'choice';
  switch (typeOf(schema)) {
    case 'string':
      return schema.maxLength !== undefined && schema.maxLength <= 200 ? 'text' : 'longText';
    case 'number':
      return 'number';
    case 'integer':
      return 'integer';
    case 'boolean':
      return 'boolean';
    case undefined:
      // An answer of any type (`zonic.input-answer@1` without an input type) is typed text.
      return 'longText';
    default:
      return 'json';
  }
}

/** `camelCase` or `snake_case` to words, for properties without a title. */
const words = (name: string): string => {
  const spaced = name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** The fields of an object schema, in property order. A lone `value` reads as "Your answer". */
export function fieldsOf(schema: JsonSchema): FieldSpec[] {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const names = Object.keys(properties);
  return names.map((name) => {
    const property = properties[name]!;
    return {
      name,
      label: property.title ?? (names.length === 1 && name === 'value' ? t('form.answer') : words(name)),
      ...(property.description ? { description: property.description } : {}),
      kind: kindOf(property),
      required: required.has(name),
      ...(Array.isArray(property.enum) ? { choices: property.enum } : {}),
      schema: property,
    };
  });
}

/** Whether the schema is an approval: an object whose answer is `approved: boolean`. */
export const isApprovalSchema = (schema: JsonSchema): boolean =>
  typeOf(schema.properties?.approved ?? {}) === 'boolean';

/** What a form starts with: defaults, else empty text and unchecked boxes. */
export function initialValues(fields: readonly FieldSpec[]): Record<string, string | boolean> {
  return Object.fromEntries(
    fields.map((field) => {
      const preset = field.schema.default;
      if (field.kind === 'boolean') return [field.name, preset === true];
      if (preset === undefined) return [field.name, ''];
      return [field.name, typeof preset === 'string' ? preset : JSON.stringify(preset)];
    }),
  );
}

export interface FormResult {
  value: Record<string, unknown>;
  errors: Record<string, string>;
}

/** Converts the inputs to the answer object and checks each field against its schema. */
export function readForm(fields: readonly FieldSpec[], inputs: Record<string, string | boolean>): FormResult {
  const value: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = inputs[field.name];
    if (field.kind === 'boolean') {
      value[field.name] = raw === true;
      continue;
    }
    const text = typeof raw === 'string' ? raw : '';
    if (text.trim() === '') {
      if (field.required) errors[field.name] = t('form.required');
      continue;
    }
    const { schema } = field;
    switch (field.kind) {
      case 'number':
      case 'integer': {
        const number = Number(text);
        if (!Number.isFinite(number) || (field.kind === 'integer' && !Number.isInteger(number)))
          errors[field.name] = t(field.kind === 'integer' ? 'form.integer' : 'form.number');
        else if (schema.minimum !== undefined && number < schema.minimum)
          errors[field.name] = t('form.minimum', { min: schema.minimum });
        else if (schema.maximum !== undefined && number > schema.maximum)
          errors[field.name] = t('form.maximum', { max: schema.maximum });
        else value[field.name] = number;
        break;
      }
      case 'choice': {
        const choice = field.choices?.find((item) => String(item) === text);
        if (choice === undefined) errors[field.name] = t('form.choice');
        else value[field.name] = choice;
        break;
      }
      case 'json':
        try {
          value[field.name] = JSON.parse(text);
        } catch {
          errors[field.name] = t('form.json');
        }
        break;
      default:
        if (schema.minLength !== undefined && text.length < schema.minLength)
          errors[field.name] = t('form.minLength', { min: schema.minLength });
        else if (schema.maxLength !== undefined && text.length > schema.maxLength)
          errors[field.name] = t('form.maxLength', { max: schema.maxLength });
        else if (schema.pattern !== undefined && !safePattern(schema.pattern, text))
          errors[field.name] = t('form.pattern');
        else value[field.name] = text;
    }
  }
  return { value, errors };
}

/** A schema pattern that does not compile does not block the form; the runtime checks it. */
function safePattern(pattern: string, text: string): boolean {
  try {
    return new RegExp(pattern, 'u').test(text);
  } catch {
    return true;
  }
}

/**
 * The runtime's validation errors (`details[].path`, for example `.value`) by field name, so they
 * show beside the field they concern.
 */
export function serverErrors(
  fields: readonly FieldSpec[],
  details: readonly { path: string; message: string }[],
): { byField: Record<string, string>; other: string[] } {
  const byField: Record<string, string> = {};
  const other: string[] = [];
  for (const detail of details) {
    const segments = detail.path.split(/[./[\]]+/).filter(Boolean);
    const field = fields.find((item) => segments.includes(item.name));
    const message = detail.message || t('form.invalid');
    if (field) byField[field.name] ??= message;
    else other.push(message);
  }
  return { byField, other };
}
