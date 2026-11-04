import { useState, type ReactNode } from "react";
import { ClipboardCheck, Loader2, MapPinned, Truck } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  AVAILABILITY,
  CDL_CLASSES,
  DRIVER_UPLOADS,
  DRIVER_UPLOAD_MAX_BYTES,
  MATERIALS,
  PAYLOAD_UNITS,
  REGISTRATION_AVAILABILITY,
  REGISTRATION_TRUCK_TYPES,
  TRAVEL_RADIUS,
  TRUCK_TYPES,
} from "@/lib/shared/domain";
import { DriverRegistrationSchema } from "@/lib/shared/validation";
import { cn } from "@/lib/utils";
import {
  ConsentCheckbox,
  Field,
  FormError,
  Honeypot,
  SubmitError,
  Turnstile,
  fieldCls,
  focusFirstError,
  postForm,
  useSpamGuard,
  zodErrors,
  type FieldErrors,
} from "./forms";
import { SectionHeader } from "./Services";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { CountyMultiSelect } from "./CountyMultiSelect";

export const DRIVER_STORAGE_KEY = "am_driver_registration";

type Opt = { value: string; label: string };
const pick = (opts: readonly Opt[], values: readonly string[]) =>
  values.map((v) => opts.find((o) => o.value === v)!);
const truckOptions = pick(TRUCK_TYPES, REGISTRATION_TRUCK_TYPES);
const availabilityOptions = pick(AVAILABILITY, REGISTRATION_AVAILABILITY);
const ACCEPT = ".pdf,application/pdf,image/jpeg,image/png,image/webp";

export function DriverRegistration() {
  const navigate = useNavigate();
  const { ts, reset } = useSpamGuard();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const data = {
      ...Object.fromEntries(fd),
      truckTypes: fd.getAll("truckTypes"),
      availability: fd.getAll("availability"),
      materials: fd.getAll("materials"),
      counties: fd.getAll("counties"),
      attestGeorgia: fd.get("attestGeorgia") === "true",
      consentPrivacy: fd.get("consentPrivacy") === "true",
      consentContact: fd.get("consentContact") === "true",
      ts: ts.current,
      turnstileToken,
    } as Record<string, unknown>;
    const parsed = DriverRegistrationSchema.safeParse(data);
    const errs: FieldErrors = parsed.success ? {} : zodErrors(parsed.error.issues);
    if (!data.consentPrivacy) errs.consentPrivacy = "Please acknowledge the privacy notice";
    for (const u of DRIVER_UPLOADS) {
      const f = fd.get(u.field);
      if (!(f instanceof File) || f.size === 0)
        errs[u.field] = `${u.label}: please attach this document.`;
      else if (f.size > DRIVER_UPLOAD_MAX_BYTES)
        errs[u.field] = `${u.label}: file is too large (max 10 MB).`;
    }
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError("Please fix the highlighted fields.");
      focusFirstError(errs);
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      fd.set("ts", String(ts.current));
      if (turnstileToken) fd.set("turnstileToken", turnstileToken);
      const json = await postForm<{
        id?: string | null;
        statusUrl?: string | null;
        documents?: string[];
      }>("/api/public/driver", fd);
      form.reset();
      reset();
      try {
        const d = parsed.data!;
        sessionStorage.setItem(
          DRIVER_STORAGE_KEY,
          JSON.stringify({
            ownerName: d.ownerName,
            companyName: d.companyName,
            email: d.email,
            dotNumber: d.dotNumber,
            mcNumber: d.mcNumber,
            truckType: d.truckTypes.join(","),
            truckCount: d.truckCount,
            payload: `${d.payloadCapacity} ${d.payloadUnit === "tons" ? "tons" : "cubic yards"}`,
            currentLocation: d.currentLocation,
            serviceArea: d.counties.join(", "),
            availability: d.availability.join(","),
            documents: json.documents ?? [],
            id: json.id ?? null,
            statusUrl: json.statusUrl ?? null,
          }),
        );
      } catch {
        /* sessionStorage unavailable; confirmation page degrades gracefully */
      }
      navigate({ to: "/drivers/confirmation" });
    } catch (err) {
      const field = err instanceof SubmitError ? err.field : undefined;
      if (field) {
        setErrors({ [field]: (err as Error).message });
        focusFirstError({ [field]: "" });
      }
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="driver-title" className="relative bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          id="driver-title"
          as="h1"
          eyebrow="Georgia dump truck owner-operators"
          title="Dump Truck Registration"
          subtitle="Register your dump truck or fleet to receive loads in Georgia. We ask only what our dispatchers need to match you with work: where your truck is, what it can haul, and when you're available."
        />
        <ul className="mb-10 mt-10 grid gap-4 md:grid-cols-3">
          <Perk
            icon={<MapPinned className="h-5 w-5" />}
            title="Georgia loads"
            body="Tell us your counties, current location and how far you'll travel."
          />
          <Perk
            icon={<Truck className="h-5 w-5" />}
            title="Single axle to quad axle"
            body="Register one truck or a whole fleet, with payload capacity."
          />
          <Perk
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="Quick review"
            body="Attach your CDL, insurance, W-9 and registration now or later."
          />
        </ul>
        <form
          onSubmit={onSubmit}
          noValidate
          aria-busy={submitting}
          encType="multipart/form-data"
          className="relative space-y-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8"
        >
          <Honeypot />
          <p className="text-xs text-muted-foreground">
            Fields marked * are required. This form is for dump trucks operating in Georgia.
          </p>

          <FormSection title="Owner & contact">
            <Field label="Owner / driver name" name="ownerName" required error={errors.ownerName}>
              {(p) => <input {...p} autoComplete="name" maxLength={100} className={fieldCls} />}
            </Field>
            <Field label="Company name" name="companyName" error={errors.companyName}>
              {(p) => (
                <input {...p} autoComplete="organization" maxLength={150} className={fieldCls} />
              )}
            </Field>
            <Field label="Email" name="email" required error={errors.email}>
              {(p) => (
                <input
                  {...p}
                  type="email"
                  autoComplete="email"
                  maxLength={255}
                  className={fieldCls}
                />
              )}
            </Field>
            <Field label="Phone" name="phone" required error={errors.phone}>
              {(p) => (
                <input {...p} type="tel" autoComplete="tel" maxLength={30} className={fieldCls} />
              )}
            </Field>
            <Field
              label="USDOT number"
              name="dotNumber"
              required
              error={errors.dotNumber}
              help="Digits only."
            >
              {(p) => <input {...p} inputMode="numeric" maxLength={8} className={fieldCls} />}
            </Field>
            <Field label="MC number" name="mcNumber" error={errors.mcNumber} help="If applicable.">
              {(p) => <input {...p} maxLength={20} className={fieldCls} />}
            </Field>
          </FormSection>

          <FormSection title="Trucks">
            <Field
              label="Number of dump trucks"
              name="truckCount"
              required
              error={errors.truckCount}
            >
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  defaultValue={1}
                  className={fieldCls}
                />
              )}
            </Field>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-charcoal" id="payload-label">
                Payload capacity
                <span className="text-destructive" aria-hidden>
                  {" "}
                  *
                </span>
              </span>
              <div className="flex gap-2">
                <input
                  id="fld-payloadCapacity"
                  name="payloadCapacity"
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  max={200}
                  step="0.5"
                  required
                  aria-labelledby="payload-label"
                  aria-invalid={errors.payloadCapacity ? true : undefined}
                  aria-describedby={
                    errors.payloadCapacity ? "fld-payloadCapacity-err" : "payload-help"
                  }
                  className={cn(fieldCls, "min-w-0 flex-1")}
                />
                <select
                  id="fld-payloadUnit"
                  name="payloadUnit"
                  aria-label="Payload unit"
                  defaultValue="tons"
                  className={cn(fieldCls, "w-40")}
                >
                  {PAYLOAD_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <p id="payload-help" className="text-xs text-muted-foreground">
                Per truck, e.g. 15 tons or 14 cubic yards.
              </p>
              {(errors.payloadCapacity || errors.payloadUnit) && (
                <p id="fld-payloadCapacity-err" className="text-xs font-medium text-destructive">
                  {errors.payloadCapacity || errors.payloadUnit}
                </p>
              )}
            </div>
            <CheckGroup
              legend="Truck type"
              name="truckTypes"
              required
              options={truckOptions}
              error={errors.truckTypes}
              help="Select all that apply."
              className="md:col-span-2"
            />
          </FormSection>

          <FormSection title="Location & availability">
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="fld-counties" className="block text-sm font-medium text-charcoal">
                Georgia counties you serve
                <span className="text-destructive" aria-hidden>
                  {" "}
                  *
                </span>
              </label>
              <CountyMultiSelect name="counties" required error={errors.counties} />
            </div>
            <Field
              label="Current truck location"
              name="currentLocation"
              required
              error={errors.currentLocation}
              help="Start typing the address where the truck is parked or working now, or use your location."
              className="md:col-span-2"
            >
              {(p) => (
                <AddressAutocomplete
                  id={p.id}
                  name={p.name}
                  describedBy={p["aria-describedby"]}
                  invalid={p["aria-invalid"]}
                  required
                  georgiaOnly
                  placeholder="Street address or city in Georgia…"
                />
              )}
            </Field>
            <CheckGroup
              legend="Availability"
              name="availability"
              required
              options={availabilityOptions}
              error={errors.availability}
              help="Select all that apply."
            />
            <Field label="Willing to travel" name="travelRadius" error={errors.travelRadius}>
              {(p) => (
                <select {...p} className={fieldCls} defaultValue="">
                  <option value="">Select…</option>
                  {TRAVEL_RADIUS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </FormSection>

          <FormSection title="Driver & insurance">
            <RadioGroup
              legend="CDL class"
              name="cdlClass"
              required
              options={CDL_CLASSES}
              error={errors.cdlClass}
            />
            <RadioGroup
              legend="Insurance active?"
              name="insuranceActive"
              required
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
              error={errors.insuranceActive}
            />
            <CheckGroup
              legend="Preferred material"
              name="materials"
              options={MATERIALS}
              error={errors.materials}
              help="Select all that apply."
              className="md:col-span-2"
              columns={4}
            />
          </FormSection>

          <FormSection
            title="Documents"
            note="All four are required. PDF, JPG, PNG or WebP, up to 10 MB each. A clear phone photo is fine. Files are stored privately and only seen by our review team."
          >
            {DRIVER_UPLOADS.map((u) => (
              <Field key={u.field} label={u.label} name={u.field} required error={errors[u.field]}>
                {(p) => (
                  <input
                    {...p}
                    type="file"
                    accept={ACCEPT}
                    className={cn(
                      fieldCls,
                      "file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium file:text-navy",
                    )}
                  />
                )}
              </Field>
            ))}
          </FormSection>

          <FormSection title="Notes">
            <Field
              label="Additional comments"
              name="notes"
              error={errors.notes}
              className="md:col-span-2"
            >
              {(p) => (
                <textarea
                  {...p}
                  rows={4}
                  maxLength={1500}
                  className={fieldCls}
                  placeholder="Equipment details, preferred job types, anything else we should know."
                />
              )}
            </Field>
          </FormSection>

          <div className="space-y-3">
            <AttestCheckbox error={errors.attestGeorgia} />
            <ConsentCheckbox error={errors.consentPrivacy}>
              I have read the{" "}
              <Link to="/privacy" target="_blank" className="font-medium text-navy underline">
                Privacy Policy
              </Link>{" "}
              and agree that AM Consulting & Hauling may use this information to review my
              registration.
            </ConsentCheckbox>
            <ConsentCheckbox name="consentContact" required={false}>
              I agree to be contacted by phone or email about dispatch opportunities. (Optional — we
              won't send marketing texts.)
            </ConsentCheckbox>
          </div>
          <Turnstile onToken={setTurnstileToken} />
          <div className="space-y-3">
            <FormError message={formError} />
            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              className="bg-navy text-white hover:bg-navy/90"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}{" "}
              {submitting ? "Submitting…" : "Submit registration"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already registered?{" "}
              <Link to="/drivers/status" className="font-medium text-navy underline">
                Check your application status
              </Link>
              .
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}

function FormSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-5 border-t border-border pt-6 first-of-type:border-t-0 first-of-type:pt-0 md:grid-cols-2">
      <legend className="sr-only">{title}</legend>
      <div className="md:col-span-2" aria-hidden="true">
        <h2 className="text-base font-semibold text-navy">{title}</h2>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </fieldset>
  );
}

/** Checkbox group. The first box carries id fld-<name> so error focus lands on the group. */
function CheckGroup({
  legend,
  name,
  options,
  required,
  error,
  help,
  className,
  columns = 2,
}: {
  legend: string;
  name: string;
  options: readonly Opt[];
  required?: boolean;
  error?: string;
  help?: string;
  className?: string;
  columns?: 2 | 4;
}) {
  return (
    <ChoiceGroup
      legend={legend}
      name={name}
      required={required}
      error={error}
      help={help}
      className={className}
    >
      <div
        className={cn(
          "grid grid-cols-2 gap-2",
          columns === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3 md:grid-cols-2",
        )}
      >
        {options.map((o, i) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-white px-3 py-2 text-sm text-charcoal has-[:checked]:border-navy has-[:checked]:bg-navy/5"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              id={i === 0 ? `fld-${name}` : undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `fld-${name}-err` : undefined}
              className="h-4 w-4 accent-[var(--navy)]"
            />
            {o.label}
          </label>
        ))}
      </div>
    </ChoiceGroup>
  );
}

function RadioGroup({
  legend,
  name,
  options,
  required,
  error,
}: {
  legend: string;
  name: string;
  options: readonly Opt[];
  required?: boolean;
  error?: string;
}) {
  return (
    <ChoiceGroup legend={legend} name={name} required={required} error={error}>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-white px-4 py-2 text-sm text-charcoal has-[:checked]:border-navy has-[:checked]:bg-navy/5"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              id={i === 0 ? `fld-${name}` : undefined}
              required={required}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `fld-${name}-err` : undefined}
              className="h-4 w-4 accent-[var(--navy)]"
            />
            {o.label}
          </label>
        ))}
      </div>
    </ChoiceGroup>
  );
}

function ChoiceGroup({
  legend,
  name,
  required,
  error,
  help,
  className,
  children,
}: {
  legend: string;
  name: string;
  required?: boolean;
  error?: string;
  help?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      className={cn("space-y-1.5", className)}
      aria-describedby={help ? `fld-${name}-help` : undefined}
    >
      <legend className="mb-1.5 block text-sm font-medium text-charcoal">
        {legend}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        )}
      </legend>
      {help && (
        <p id={`fld-${name}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
      {children}
      {error && (
        <p id={`fld-${name}-err`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function AttestCheckbox({ error }: { error?: string }) {
  return (
    <div className="rounded-lg border border-navy/20 bg-navy/5 p-4">
      <div className="flex items-start gap-3">
        <input
          id="fld-attestGeorgia"
          name="attestGeorgia"
          type="checkbox"
          value="true"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "fld-attestGeorgia-err" : undefined}
          className="mt-1 h-4 w-4 rounded border-input accent-[var(--navy)]"
        />
        <label htmlFor="fld-attestGeorgia" className="text-sm font-medium text-charcoal">
          I confirm that my truck is insured, properly registered, and authorized to operate in the
          State of Georgia.
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        </label>
      </div>
      {error && (
        <p id="fld-attestGeorgia-err" className="mt-1 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Perk({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-border bg-surface p-5">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-navy text-white"
        aria-hidden
      >
        {icon}
      </span>
      <span>
        <span className="block font-semibold text-navy">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{body}</span>
      </span>
    </li>
  );
}
