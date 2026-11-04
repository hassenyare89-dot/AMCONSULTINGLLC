import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PRIVACY_REQUEST_TYPES, US_STATES } from "@/lib/shared/domain";
import { PrivacyRequestSchema } from "@/lib/shared/validation";
import { pageHead } from "@/lib/content/site";
import {
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

export const Route = createFileRoute("/privacy/request")({
  head: ({ matches }) =>
    pageHead("/privacy/request", matches, {
      title: "Privacy request | AM Consulting & Hauling",
      description:
        "Ask to access, correct, or delete the personal information AM Consulting & Hauling holds about you.",
    }),
  component: PrivacyRequestPage,
});

function PrivacyRequestPage() {
  const { ts } = useSpamGuard();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>();
  return (
    <section className="bg-surface pb-20 pt-32">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <h1 className="text-3xl font-extrabold text-navy">Privacy request</h1>
        <p className="mt-2 text-muted-foreground">
          Use this form to ask what personal information we hold about you, or to correct or delete
          it, or stop contact. See our{" "}
          <Link to="/privacy" className="text-navy underline">
            Privacy Policy
          </Link>
          . We may contact you to verify your identity.
        </p>
        {done ? (
          <p role="status" className="mt-8 rounded-xl border border-border bg-card p-6">
            Request received. Your reference is <strong className="font-mono">{done}</strong>. We
            aim to respond within 45 days.
          </p>
        ) : (
          <form
            noValidate
            className="relative mt-8 space-y-5 rounded-2xl border border-border bg-card p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = {
                ...Object.fromEntries(new FormData(e.currentTarget)),
                ts: ts.current,
                turnstileToken,
              };
              const parsed = PrivacyRequestSchema.safeParse(data);
              if (!parsed.success) {
                const errs = zodErrors(parsed.error.issues);
                setErrors(errs);
                focusFirstError(errs);
                return;
              }
              setBusy(true);
              setFormError(null);
              try {
                setDone(
                  (await postJson<{ ref: string }>("/api/public/privacy-request", parsed.data)).ref,
                );
              } catch (err) {
                setFormError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Honeypot />
            <Field label="Name" name="name" required error={errors.name}>
              {(p) => <input {...p} autoComplete="name" className={fieldCls} />}
            </Field>
            <Field
              label="Email"
              name="email"
              required
              error={errors.email}
              help="Use the email you used with us so we can find your records."
            >
              {(p) => <input {...p} type="email" autoComplete="email" className={fieldCls} />}
            </Field>
            <Field
              label="State of residence"
              name="stateOfResidence"
              error={errors.stateOfResidence}
            >
              {(p) => (
                <select {...p} className={fieldCls} defaultValue="">
                  <option value="">Prefer not to say</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Request type" name="requestType" required error={errors.requestType}>
              {(p) => (
                <select {...p} className={fieldCls} defaultValue="">
                  <option value="" disabled>
                    Select…
                  </option>
                  {PRIVACY_REQUEST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Details" name="details" error={errors.details}>
              {(p) => <textarea {...p} rows={4} maxLength={3000} className={fieldCls} />}
            </Field>
            <Turnstile onToken={setTurnstileToken} />
            <FormError message={formError} />
            <Button type="submit" disabled={busy} className="bg-navy text-white hover:bg-navy/90">
              Submit request
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
