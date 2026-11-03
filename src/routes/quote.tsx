import { createFileRoute, Link } from "@tanstack/react-router";
import { stringParams } from "@/lib/shared/search";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SERVICE_TYPES, TRUCK_TYPES } from "@/lib/shared/domain";
import { QuoteRequestSchema } from "@/lib/shared/validation";
import { pageHead } from "@/lib/content/site";
import { AddressAutocomplete } from "@/components/site/AddressAutocomplete";
import {
  ConsentCheckbox,
  Field,
  FormError,
  Honeypot,
  Turnstile,
  fieldCls,
  focusFirstError,
  postJson,
  useSpamGuard,
  zodErrors,
  type FieldErrors,
} from "@/components/site/forms";
import { SectionHeader } from "@/components/site/Services";

export const Route = createFileRoute("/quote")({
  validateSearch: stringParams("service"),
  head: ({ matches }) => pageHead("/quote", matches),
  component: QuotePage,
});

function QuotePage() {
  const { service } = Route.useSearch() as { service?: string };
  const { ts, reset } = useSpamGuard();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>();
  const today = new Date().toISOString().slice(0, 10);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd) as Record<string, unknown>;
    const data = {
      ...raw,
      truckCount: raw.truckCount ? Number(raw.truckCount) : undefined,
      consentPrivacy: fd.get("consentPrivacy") === "true",
      ts: ts.current,
      turnstileToken,
    };
    const parsed = QuoteRequestSchema.safeParse(data);
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      setErrors(errs);
      setFormError("Please fix the highlighted fields.");
      focusFirstError(errs);
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      const r = await postJson<{ ref: string }>("/api/public/quote", parsed.data);
      reset();
      setDone(r.ref);
      requestAnimationFrame(() => document.getElementById("quote-done")?.focus());
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-surface pb-20 pt-32">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          as="h1"
          eyebrow="Request a quote"
          title="Tell us about your hauling needs"
          subtitle="Share your project details and our team will prepare an estimate or follow up with questions. Estimates are for planning and aren't binding until confirmed in writing."
        />
        {done ? (
          <div
            id="quote-done"
            tabIndex={-1}
            role="status"
            className="mt-10 rounded-2xl border border-border bg-card p-8 focus:outline-none"
          >
            <CheckCircle2 className="h-10 w-10 text-brand-green" aria-hidden />
            <h2 className="mt-3 text-2xl font-bold text-navy">Request received</h2>
            {done !== "RECEIVED" && (
              <p className="mt-2">
                Your reference is <strong className="font-mono">{done}</strong>.
              </p>
            )}
            <p className="mt-2 text-muted-foreground">
              We'll be in touch, usually within one business day. Want to talk it through sooner?{" "}
              <Link to="/book" className="text-navy underline">
                Book a consultation
              </Link>
              .
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            noValidate
            aria-busy={busy}
            className="relative mt-10 grid gap-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8 md:grid-cols-2"
          >
            <Honeypot />
            <fieldset className="contents">
              <legend className="text-lg font-bold text-navy md:col-span-2">
                Your contact information
              </legend>
              <Field label="Name" name="name" required error={errors.name}>
                {(p) => <input {...p} autoComplete="name" maxLength={100} className={fieldCls} />}
              </Field>
              <Field label="Company" name="company" error={errors.company}>
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
              <Field label="Phone" name="phone" error={errors.phone}>
                {(p) => (
                  <input {...p} type="tel" autoComplete="tel" maxLength={30} className={fieldCls} />
                )}
              </Field>
            </fieldset>
            <fieldset className="contents">
              <legend className="mt-4 text-lg font-bold text-navy md:col-span-2">
                Project details
              </legend>
              <Field
                label="Service"
                name="serviceType"
                required
                error={errors.serviceType}
                className="md:col-span-2"
              >
                {(p) => (
                  <select
                    {...p}
                    className={fieldCls}
                    defaultValue={SERVICE_TYPES.some((s) => s.value === service) ? service : ""}
                  >
                    <option value="" disabled>
                      Select a service…
                    </option>
                    {SERVICE_TYPES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label="Jobsite / pickup location"
                name="pickupLocation"
                required
                error={errors.pickupLocation}
                className="md:col-span-2"
              >
                {(p) => (
                  <AddressAutocomplete
                    id={p.id}
                    name={p.name}
                    describedBy={p["aria-describedby"]}
                    invalid={p["aria-invalid"]}
                    required
                  />
                )}
              </Field>
              <Field
                label="Destination (if applicable)"
                name="destination"
                error={errors.destination}
                className="md:col-span-2"
              >
                {(p) => <input {...p} maxLength={300} className={fieldCls} />}
              </Field>
              <Field label="Truck type" name="truckType" error={errors.truckType}>
                {(p) => (
                  <select {...p} className={fieldCls} defaultValue="">
                    <option value="">Not sure / any</option>
                    {TRUCK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Number of trucks" name="truckCount" error={errors.truckCount}>
                {(p) => <input {...p} type="number" min={1} max={500} className={fieldCls} />}
              </Field>
              <Field
                label="Material"
                name="material"
                error={errors.material}
                help="e.g. dirt, gravel, asphalt millings"
              >
                {(p) => <input {...p} maxLength={120} className={fieldCls} />}
              </Field>
              <Field
                label="Estimated duration"
                name="estimatedDuration"
                error={errors.estimatedDuration}
                help="e.g. 3 days, 2 weeks"
              >
                {(p) => <input {...p} maxLength={120} className={fieldCls} />}
              </Field>
              <Field label="Preferred start date" name="preferredDate" error={errors.preferredDate}>
                {(p) => <input {...p} type="date" min={today} className={fieldCls} />}
              </Field>
              <Field
                label="Additional requirements"
                name="details"
                error={errors.details}
                className="md:col-span-2"
              >
                {(p) => (
                  <textarea
                    {...p}
                    rows={4}
                    maxLength={3000}
                    className={fieldCls}
                    placeholder="Site access, hours, loads per day, anything else."
                  />
                )}
              </Field>
            </fieldset>
            <div className="md:col-span-2">
              <ConsentCheckbox error={errors.consentPrivacy} />
            </div>
            <div className="md:col-span-2">
              <Turnstile onToken={setTurnstileToken} />
            </div>
            <div className="space-y-3 md:col-span-2">
              <FormError message={formError} />
              <Button
                type="submit"
                size="lg"
                disabled={busy}
                className="bg-navy text-white hover:bg-navy/90"
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}Submit quote
                request
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
