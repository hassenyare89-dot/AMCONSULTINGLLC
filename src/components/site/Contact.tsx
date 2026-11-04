import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactSchema } from "@/lib/shared/validation";
import { SERVICE_TYPES } from "@/lib/shared/domain";
import { brandOf, useSiteContent } from "@/lib/content/site";
import { AddressAutocomplete } from "./AddressAutocomplete";
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
import { cn } from "@/lib/utils";

export function Contact() {
  const brand = brandOf(useSiteContent());
  const { ts, reset } = useSpamGuard();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [chars, setChars] = useState(0);
  const [success, setSuccess] = useState<{ ref: string; name: string; email: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>();
  const [showMap, setShowMap] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const data = {
      ...Object.fromEntries(fd),
      consentPrivacy: fd.get("consentPrivacy") === "true",
      ts: ts.current,
      turnstileToken,
    } as Record<string, unknown>;
    const parsed = ContactSchema.safeParse(data);
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
      const r = await postJson<{ ref: string }>("/api/public/contact", parsed.data);
      form.reset();
      setChars(0);
      reset();
      setSuccess({ ref: r.ref, name: String(data.name), email: String(data.email) });
      requestAnimationFrame(() => document.getElementById("contact-success")?.focus());
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="contact" aria-labelledby="contact-title" className="bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-brand-green-ink">
            Contact
          </span>
          <h1 id="contact-title" className="mt-3 text-4xl font-extrabold text-navy sm:text-5xl">
            Contact our team
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Questions about dispatch coordination, hauling support, or consulting? Send us a message
            and we'll respond, usually within one business day.
          </p>
        </div>
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow-elevated)] md:flex-row">
          <aside className="relative bg-navy-deep p-8 text-white sm:p-10 md:w-2/5">
            <h2 className="text-2xl font-bold">
              Talk with <span className="text-brand-green-soft">{brand.companyName}</span>
            </h2>
            <dl className="mt-8 space-y-6">
              <div>
                <dt className="text-xs uppercase tracking-widest text-white/70">Phone</dt>
                <dd>
                  <a
                    href={`tel:${brand.phoneE164}`}
                    className="inline-flex items-center gap-2 text-lg font-semibold hover:text-brand-green-soft focus-visible:focus-brand rounded"
                  >
                    <Phone className="h-4 w-4 text-brand-green" aria-hidden />
                    {brand.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-white/70">Email</dt>
                <dd>
                  <a
                    href={`mailto:${brand.email}`}
                    className="inline-flex items-center gap-2 break-all text-lg font-semibold hover:text-brand-green-soft focus-visible:focus-brand rounded"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-brand-green" aria-hidden />
                    {brand.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-white/70">Office</dt>
                <dd>
                  <a
                    href={brand.mapSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-2 font-semibold leading-snug hover:text-brand-green-soft focus-visible:focus-brand rounded"
                  >
                    <MapPin className="mt-1 h-4 w-4 shrink-0 text-brand-green" aria-hidden />
                    <span>{brand.addressFull}</span>
                  </a>
                </dd>
              </div>
              {brand.hours && (
                <div>
                  <dt className="text-xs uppercase tracking-widest text-white/70">Hours</dt>
                  <dd className="inline-flex items-center gap-2 font-semibold">
                    <Clock className="h-4 w-4 text-brand-green" aria-hidden />
                    {brand.hours}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-widest text-white/70">Service area</dt>
                <dd className="font-semibold">{brand.serviceArea}</dd>
              </div>
            </dl>
            <div className="mt-8 flex flex-col gap-2 text-sm">
              <Link
                to="/quote"
                className="font-semibold text-brand-green-soft underline underline-offset-4"
              >
                Request a detailed quote →
              </Link>
              <Link
                to="/book"
                className="inline-flex items-center gap-2 font-semibold text-brand-green-soft underline underline-offset-4"
              >
                <CalendarClock className="h-4 w-4" aria-hidden />
                Book a consultation
              </Link>
            </div>
          </aside>
          <div className="relative p-8 sm:p-10 md:w-3/5">
            {success ? (
              <SuccessPanel data={success} onReset={() => setSuccess(null)} />
            ) : (
              <form
                onSubmit={onSubmit}
                noValidate
                aria-busy={submitting}
                className="relative grid grid-cols-1 gap-5 md:grid-cols-2"
                aria-describedby="contact-required-note"
              >
                <Honeypot />
                <p
                  id="contact-required-note"
                  className="text-xs text-muted-foreground md:col-span-2"
                >
                  Fields marked * are required.
                </p>
                <Field label="Name" name="name" required error={errors.name}>
                  {(p) => (
                    <input
                      {...p}
                      type="text"
                      autoComplete="name"
                      maxLength={100}
                      className={fieldCls}
                    />
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
                    <input
                      {...p}
                      type="tel"
                      autoComplete="tel"
                      maxLength={30}
                      className={fieldCls}
                    />
                  )}
                </Field>
                <Field label="Company" name="company" error={errors.company}>
                  {(p) => (
                    <input
                      {...p}
                      type="text"
                      autoComplete="organization"
                      maxLength={120}
                      className={fieldCls}
                    />
                  )}
                </Field>
                <Field
                  label="Project / jobsite address"
                  name="address"
                  error={errors.address}
                  className="md:col-span-2"
                >
                  {(p) => (
                    <AddressAutocomplete
                      id={p.id}
                      name={p.name}
                      describedBy={p["aria-describedby"]}
                      invalid={p["aria-invalid"]}
                      disabled={submitting}
                    />
                  )}
                </Field>
                <Field
                  label="Service of interest"
                  name="service"
                  error={errors.service}
                  className="md:col-span-2"
                >
                  {(p) => (
                    <select {...p} className={fieldCls} defaultValue="">
                      <option value="">Select a service…</option>
                      {SERVICE_TYPES.map((s) => (
                        <option key={s.value} value={s.label}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field
                  label="Message"
                  name="message"
                  required
                  error={errors.message}
                  className="md:col-span-2"
                  help={<span aria-live="polite">{chars}/2000 characters</span>}
                >
                  {(p) => (
                    <textarea
                      {...p}
                      rows={5}
                      maxLength={2000}
                      onChange={(e) => setChars(e.target.value.length)}
                      className={cn(fieldCls, "resize-y")}
                      placeholder="Tell us about your trucks or your project — scope, location, timing, equipment."
                    />
                  )}
                </Field>
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
                    disabled={submitting}
                    className="w-full bg-navy text-white hover:bg-navy/90 sm:w-auto"
                  >
                    {submitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="mr-2 h-4 w-4" aria-hidden />
                    )}
                    {submitting ? "Sending…" : "Send message"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-white">
          {showMap ? (
            <iframe
              title={`Map of ${brand.addressFull}`}
              src={brand.mapEmbedUrl}
              className="h-80 w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                The map is provided by Google, which may set cookies once loaded.
              </p>
              <Button variant="outline" onClick={() => setShowMap(true)}>
                <MapPin className="mr-2 h-4 w-4" aria-hidden />
                Show map
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SuccessPanel({
  data,
  onReset,
}: {
  data: { ref: string; name: string; email: string };
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div id="contact-success" tabIndex={-1} role="status" className="space-y-5 focus:outline-none">
      <CheckCircle2 className="h-10 w-10 text-brand-green" aria-hidden />
      <h2 className="text-2xl font-bold text-navy">Thanks, {data.name} — message received.</h2>
      <p className="text-muted-foreground">
        We'll reply to <strong>{data.email}</strong>, usually within one business day. A
        confirmation email is on its way if email delivery is enabled.
      </p>
      {data.ref !== "RECEIVED" && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Reference</div>
            <div className="font-mono text-lg font-semibold text-navy">{data.ref}</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => navigator.clipboard?.writeText(data.ref).then(() => setCopied(true))}
            aria-label="Copy reference"
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
      )}
      <Button variant="ghost" onClick={onReset}>
        Send another message
      </Button>
    </div>
  );
}
