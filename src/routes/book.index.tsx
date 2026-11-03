import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APPOINTMENT_TOPICS } from "@/lib/shared/domain";
import { AppointmentRequestSchema } from "@/lib/shared/validation";
import { pageHead } from "@/lib/content/site";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book/")({
  head: ({ matches }) =>
    pageHead("/book", matches, {
      title: "Book a consultation | AM Consulting LLC",
      description:
        "Schedule a consultation about dispatch coordination, hauling support, or transportation consulting.",
    }),
  component: BookPage,
});

type Slot = { start: string; end: string };

function BookPage() {
  const { ts } = useSpamGuard();
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [tz, setTz] = useState("America/New_York");
  const [slot, setSlot] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: string; when?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>();
  const min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  useEffect(() => {
    if (!date) return;
    setLoadingSlots(true);
    setSlot("");
    fetch(`/api/public/appointments?date=${date}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setSlots(j.slots);
          setTz(j.timezone);
        } else setFormError(j.error);
      })
      .catch(() => setFormError("Couldn't load available times."))
      .finally(() => setLoadingSlots(false));
  }, [date]);

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
      new Date(iso),
    );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      ...Object.fromEntries(fd),
      start: slot,
      consentPrivacy: fd.get("consentPrivacy") === "true",
      ts: ts.current,
      turnstileToken,
    };
    const parsed = AppointmentRequestSchema.safeParse(data);
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      setErrors(errs);
      setFormError(errs.start ? "Choose a date and time." : "Please fix the highlighted fields.");
      focusFirstError(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      setDone(
        await postJson<{ status: string; when?: string }>("/api/public/appointments", parsed.data),
      );
    } catch (err) {
      setFormError((err as Error).message);
      if (date) setDate(`${date}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-surface pb-20 pt-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeader
          as="h1"
          eyebrow="Consultation"
          title="Book a consultation"
          subtitle={`Pick a time that works for you. Times are shown in ${tz.replace("_", " ")}.`}
        />
        {done ? (
          <div role="status" className="mt-10 rounded-2xl border border-border bg-card p-8">
            <CalendarCheck className="h-10 w-10 text-brand-green" aria-hidden />
            <h2 className="mt-3 text-2xl font-bold text-navy">
              {done.status === "confirmed" ? "You're booked" : "Request received"}
            </h2>
            {done.when && <p className="mt-2 font-medium">{done.when}</p>}
            <p className="mt-2 text-muted-foreground">
              {done.status === "confirmed"
                ? "We've emailed your confirmation."
                : "We'll confirm by email shortly."}{" "}
              The email includes a link to reschedule or cancel.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            noValidate
            className="relative mt-10 grid gap-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8 md:grid-cols-2"
          >
            <Honeypot />
            <Field label="Date" name="date" required className="md:col-span-2">
              {(p) => (
                <input
                  {...p}
                  type="date"
                  min={min}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={cn(fieldCls, "max-w-xs")}
                />
              )}
            </Field>
            {date && (
              <fieldset
                className="md:col-span-2"
                aria-describedby={errors.start ? "slot-err" : undefined}
              >
                <legend className="mb-2 text-sm font-medium">
                  Available times{" "}
                  <span className="text-destructive" aria-hidden>
                    *
                  </span>
                </legend>
                {loadingSlots ? (
                  <p role="status" className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading times…
                  </p>
                ) : slots && slots.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {slots.map((s) => (
                      <label
                        key={s.start}
                        className={cn(
                          "cursor-pointer rounded-md border px-2 py-2 text-center text-sm focus-within:ring-2 focus-within:ring-brand-green",
                          slot === s.start
                            ? "border-navy bg-navy text-white"
                            : "border-border hover:bg-secondary",
                        )}
                      >
                        <input
                          type="radio"
                          name="slot"
                          value={s.start}
                          className="sr-only"
                          checked={slot === s.start}
                          onChange={() => setSlot(s.start)}
                        />
                        {fmt(s.start)}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No times available that day. Please choose another date.
                  </p>
                )}
                {errors.start && (
                  <p id="slot-err" className="mt-1 text-xs text-destructive">
                    {errors.start}
                  </p>
                )}
              </fieldset>
            )}
            <Field label="Name" name="name" required error={errors.name}>
              {(p) => <input {...p} autoComplete="name" className={fieldCls} />}
            </Field>
            <Field label="Email" name="email" required error={errors.email}>
              {(p) => <input {...p} type="email" autoComplete="email" className={fieldCls} />}
            </Field>
            <Field label="Phone" name="phone" error={errors.phone}>
              {(p) => <input {...p} type="tel" autoComplete="tel" className={fieldCls} />}
            </Field>
            <Field label="Company" name="company" error={errors.company}>
              {(p) => <input {...p} autoComplete="organization" className={fieldCls} />}
            </Field>
            <Field
              label="Topic"
              name="topic"
              required
              error={errors.topic}
              className="md:col-span-2"
            >
              {(p) => (
                <select {...p} className={fieldCls} defaultValue="">
                  <option value="" disabled>
                    Select…
                  </option>
                  {APPOINTMENT_TOPICS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Notes" name="notes" error={errors.notes} className="md:col-span-2">
              {(p) => <textarea {...p} rows={3} maxLength={1500} className={fieldCls} />}
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
                disabled={busy}
                className="bg-navy text-white hover:bg-navy/90"
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}Request this
                time
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
