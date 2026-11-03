import { z, type ZodTypeAny } from "zod";
import type { FieldDef, ResourceDef } from "./resources";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

function fieldSchema(f: FieldDef): ZodTypeAny {
  let s: ZodTypeAny;
  switch (f.type) {
    case "text":
    case "textarea":
    case "tel": {
      let t = z
        .string()
        .trim()
        .max(f.max ?? (f.type === "textarea" ? 4000 : 300));
      if (f.min) t = t.min(f.min, `${f.label} is too short`);
      if (f.pattern)
        t = t.regex(new RegExp(f.pattern), f.patternMessage ?? `${f.label} is invalid`);
      if (f.type === "tel")
        t = t.regex(/^[0-9+().\-\s x]*$/i, "Phone number contains invalid characters");
      s = f.uppercase ? t.transform((v) => v.toUpperCase()) : t;
      if (f.required) s = (s as z.ZodString).pipe(z.string().min(1, `${f.label} is required`));
      break;
    }
    case "email":
      s = z
        .string()
        .trim()
        .max(f.max ?? 255)
        .email(`${f.label} must be a valid email`)
        .transform((v) => v.toLowerCase());
      break;
    case "number":
    case "money":
      s = z.coerce
        .number({ invalid_type_error: `${f.label} must be a number` })
        .min(f.min ?? -1e12, `${f.label} is too small`)
        .max(f.max ?? 1e12, `${f.label} is too large`)
        .transform((v) => (f.type === "money" ? Math.round(v * 100) / 100 : v));
      break;
    case "integer":
      s = z.coerce
        .number()
        .int(`${f.label} must be a whole number`)
        .min(f.min ?? -1e9)
        .max(f.max ?? 1e9);
      break;
    case "date":
      s = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${f.label} must be a date`);
      break;
    case "datetime":
      s = z
        .string()
        .refine((v) => !Number.isNaN(Date.parse(v)), `${f.label} must be a date/time`)
        .transform((v) => new Date(v).toISOString());
      break;
    case "select": {
      const values = (f.options ?? []).map((o) => o.value);
      s = z.string().refine((v) => values.includes(v), `${f.label} has an invalid value`);
      break;
    }
    case "boolean":
      s = z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]);
      break;
    case "ref":
      s = z.string().regex(UUID, `${f.label} is invalid`);
      break;
  }
  if (f.required) return z.preprocess((v) => (v === "" ? undefined : v), s);
  return z.preprocess(emptyToNull, s.nullable());
}

/** Writable (non-readonly) fields, optionally restricted to the ones allowed on update. */
export function writableFields(def: ResourceDef, mode: "create" | "update"): FieldDef[] {
  return def.fields.filter((f) => !f.readonly && !(mode === "update" && f.createOnly));
}

/** Zod schema for a create (all required fields must be present) or update (partial). */
export function buildResourceSchema(def: ResourceDef, mode: "create" | "update") {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of writableFields(def, mode)) {
    const s = fieldSchema(f);
    shape[f.name] = mode === "update" || !f.required ? s.optional() : s;
  }
  return z.object(shape).strict();
}

/** Strips characters that have meaning in PostgREST filter syntax. */
export function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/[,()%*\\:"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
