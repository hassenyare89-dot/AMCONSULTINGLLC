import { useState } from "react";
import { ClipboardCheck, Loader2, MapPinned, Truck } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AVAILABILITY, TRUCK_TYPES, REGISTRATION_TRUCK_TYPES } from "@/lib/shared/domain";
import { DriverRegistrationSchema } from "@/lib/shared/validation";
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
} from "./forms";
import { SectionHeader } from "./Services";

export const DRIVER_STORAGE_KEY = "am_driver_registration";
const truckOptions = TRUCK_TYPES.filter((t) =>
  (REGISTRATION_TRUCK_TYPES as readonly string[]).includes(t.value),
);

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
      consentPrivacy: fd.get("consentPrivacy") === "true",
      consentContact: fd.get("consentContact") === "true",
      ts: ts.current,
      turnstileToken,
    } as Record<string, unknown>;
    const parsed = DriverRegistrationSchema.safeParse(data);
    const errs: FieldErrors = parsed.success ? {} : zodErrors(parsed.error.issues);
    if (!data.consentPrivacy) errs.consentPrivacy = "Please acknowledge the privacy notice";
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
      const json = await postJson<{ id?: string | null; statusUrl?: string | null }>(
        "/api/public/driver",
        parsed.data,
      );
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
            truckType: d.truckType,
            truckCount: d.truckCount,
            serviceArea: d.serviceArea,
            availability: d.availability,
            id: json.id ?? null,
            statusUrl: json.statusUrl ?? null,
          }),
        );
      } catch {
        /* sessionStorage unavailable; confirmation page degrades gracefully */
      }
      navigate({ to: "/drivers/confirmation" });
    } catch (err) {
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
          eyebrow="Drive with us"
          title="Owner-Operator Registration"
          subtitle="Register your dump truck or fleet with our dispatch team. We review every registration and will contact you about coordination in your service area."
        />
        <ul className="mb-10 mt-10 grid gap-4 md:grid-cols-3">
          <Perk
            icon={<MapPinned className="h-5 w-5" />}
            title="Your service area"
            body="Tell us where you prefer to work and when you're available."
          />
          <Perk
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="Straightforward review"
            body="We verify details such as authority and insurance before coordinating work."
          />
          <Perk
            icon={<Truck className="h-5 w-5" />}
            title="All dump truck types"
            body="Tandems, quads, side dumps, super dumps and more."
          />
        </ul>
        <form
          onSubmit={onSubmit}
          noValidate
          aria-busy={submitting}
          className="relative grid gap-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8 md:grid-cols-2"
        >
          <Honeypot />
          <p className="text-xs text-muted-foreground md:col-span-2">
            Fields marked * are required. We only ask for what we need to review your registration.
          </p>
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
            error={errors.dotNumber}
            help="Where applicable — digits only."
          >
            {(p) => <input {...p} inputMode="numeric" maxLength={20} className={fieldCls} />}
          </Field>
          <Field label="MC number" name="mcNumber" error={errors.mcNumber} help="Where applicable.">
            {(p) => <input {...p} maxLength={20} className={fieldCls} />}
          </Field>
          <Field label="Truck type" name="truckType" required error={errors.truckType}>
            {(p) => (
              <select {...p} className={fieldCls} defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                {truckOptions.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Number of trucks" name="truckCount" required error={errors.truckCount}>
            {(p) => (
              <input {...p} type="number" min={1} max={500} defaultValue={1} className={fieldCls} />
            )}
          </Field>
          <Field
            label="Service area"
            name="serviceArea"
            required
            error={errors.serviceArea}
            help="e.g. Metro Atlanta, Gwinnett, I-85 corridor"
          >
            {(p) => <input {...p} maxLength={200} className={fieldCls} />}
          </Field>
          <Field
            label="General availability"
            name="availability"
            required
            error={errors.availability}
          >
            {(p) => (
              <select {...p} className={fieldCls} defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                {AVAILABILITY.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Notes" name="notes" error={errors.notes} className="md:col-span-2">
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
          <div className="space-y-3 md:col-span-2">
            <ConsentCheckbox error={errors.consentPrivacy}>
              I have read the{" "}
              <Link to="/privacy" target="_blank" className="font-medium text-navy underline">
                Privacy Policy
              </Link>{" "}
              and agree that AM Consulting LLC may use this information to review my registration.
            </ConsentCheckbox>
            <ConsentCheckbox name="consentContact" required={false}>
              I agree to be contacted by phone or email about dispatch opportunities. (Optional — we
              won't send marketing texts.)
            </ConsentCheckbox>
          </div>
          <div className="md:col-span-2">
            <Turnstile onToken={setTurnstileToken} />
          </div>
          <div className="space-y-3 md:col-span-2">
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
