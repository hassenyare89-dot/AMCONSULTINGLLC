import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FieldDef, ResourceDef } from "@/lib/shared/resources";
import { buildResourceSchema, writableFields } from "@/lib/shared/resource-schema";
import { toLocalInput } from "@/lib/admin/rpc";
import { RefSelect } from "./RefSelect";
import { inputCls } from "./kit";
import { cn } from "@/lib/utils";

type Values = Record<string, unknown>;

function initialValues(def: ResourceDef, row?: Values | null, preset?: Values): Values {
  const v: Values = {};
  for (const f of def.fields) {
    const raw = row?.[f.name] ?? preset?.[f.name] ?? (row ? null : (f.default ?? null));
    if (f.type === "datetime") v[f.name] = raw ? toLocalInput(raw) : "";
    else if (f.type === "boolean") v[f.name] = Boolean(raw);
    else v[f.name] = raw ?? "";
  }
  return v;
}

function toPayload(
  def: ResourceDef,
  values: Values,
  mode: "create" | "update",
  original?: Values | null,
): Values {
  const out: Values = {};
  for (const f of writableFields(def, mode)) {
    let v = values[f.name];
    if (f.type === "datetime") v = v ? new Date(String(v)).toISOString() : "";
    if (mode === "update" && original) {
      const o = original[f.name];
      const same =
        f.type === "datetime"
          ? (o ? new Date(String(o)).toISOString() : "") === v
          : String(o ?? "") === String(v ?? "");
      if (same) continue;
    }
    out[f.name] = v;
  }
  return out;
}

/**
 * Form generated from a resource definition. Client-side validation mirrors the server schema
 * for fast feedback; the server re-validates everything.
 */
export function ResourceForm({
  def,
  row,
  preset,
  refLabels = {},
  readOnly,
  hiddenFields = [],
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
  serverError,
}: {
  def: ResourceDef;
  row?: Values | null;
  preset?: Values;
  refLabels?: Record<string, string>;
  readOnly?: boolean;
  hiddenFields?: string[];
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (payload: Values) => void;
  onCancel?: () => void;
  serverError?: { message: string; details?: any } | null;
}) {
  const mode = row ? "update" : "create";
  const [values, setValues] = useState<Values>(() => initialValues(def, row, preset));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setValues(initialValues(def, row, preset)), [def, row, preset]);
  const schema = useMemo(() => buildResourceSchema(def, mode), [def, mode]);
  const fields = def.fields.filter(
    (f) => !hiddenFields.includes(f.name) && !(mode === "create" && f.readonly),
  );
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));
  const serverField = serverError?.details?.field as string | undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = toPayload(def, values, mode, row);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setErrors({});
    onSubmit(payload);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <FieldInput
            key={f.name}
            f={f}
            value={values[f.name]}
            onChange={(v) => set(f.name, v)}
            error={errors[f.name] ?? (serverField === f.name ? serverError?.message : undefined)}
            readOnly={readOnly || f.readonly || (mode === "update" && f.createOnly)}
            refLabel={refLabels[String(values[f.name] ?? "")]}
          />
        ))}
      </div>
      {serverError && !serverField && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {serverError.message}
        </p>
      )}
      {!readOnly && (
        <div className="flex justify-end gap-2 pt-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={submitting}
            className="bg-navy text-white hover:bg-navy/90"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {submitLabel ??
              (mode === "create" ? `Create ${def.singular.toLowerCase()}` : "Save changes")}
          </Button>
        </div>
      )}
    </form>
  );
}

function FieldInput({
  f,
  value,
  onChange,
  error,
  readOnly,
  refLabel,
}: {
  f: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  readOnly?: boolean;
  refLabel?: string;
}) {
  const id = `f-${f.name}`;
  const describedBy =
    [error && `${id}-err`, f.help && `${id}-help`].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    "aria-invalid": Boolean(error) || undefined,
    "aria-describedby": describedBy,
    disabled: readOnly,
  };
  let control: React.ReactNode;
  switch (f.type) {
    case "textarea":
      control = (
        <textarea
          {...common}
          className={cn(inputCls, "min-h-24")}
          maxLength={f.max}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "select":
      control = (
        <select
          {...common}
          className={inputCls}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {!f.required && <option value="">—</option>}
          {f.required && !value && <option value="">Select…</option>}
          {(f.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "boolean":
      control = (
        <div className="flex h-9 items-center">
          <Switch
            id={id}
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(v)}
            disabled={readOnly}
            aria-describedby={describedBy}
          />
        </div>
      );
      break;
    case "ref":
      control = (
        <RefSelect
          id={id}
          target={f.ref!}
          value={(value as string) || null}
          onChange={(v) => onChange(v ?? "")}
          initialLabel={refLabel}
          disabled={readOnly}
          ariaLabel={f.label}
        />
      );
      break;
    default: {
      const type =
        {
          email: "email",
          tel: "tel",
          number: "number",
          integer: "number",
          money: "number",
          date: "date",
          datetime: "datetime-local",
          text: "text",
        }[f.type] ?? "text";
      control = (
        <input
          {...common}
          type={type}
          className={inputCls}
          value={String(value ?? "")}
          maxLength={
            f.type === "text" || f.type === "tel" || f.type === "email" ? f.max : undefined
          }
          step={f.type === "money" ? "0.01" : f.type === "number" ? "any" : undefined}
          min={
            f.type === "number" || f.type === "integer" || f.type === "money" ? f.min : undefined
          }
          max={
            f.type === "number" || f.type === "integer" || f.type === "money" ? f.max : undefined
          }
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
      );
    }
  }
  return (
    <div className={cn("space-y-1.5", (f.wide || f.type === "textarea") && "sm:col-span-2")}>
      <Label htmlFor={id}>
        {f.label}
        {f.required && (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        )}
        {f.required && <span className="sr-only"> (required)</span>}
      </Label>
      {control}
      {f.help && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {f.help}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
