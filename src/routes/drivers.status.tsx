import { createFileRoute, Link } from "@tanstack/react-router";
import { stringParams } from "@/lib/shared/search";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AVAILABILITY, TRUCK_TYPES, labelsFor } from "@/lib/shared/domain";
import { Field, FormError, fieldCls, postJson } from "@/components/site/forms";

type Reg = {
  id: string;
  status: string;
  statusLabel: string;
  created_at: string;
  updated_at?: string;
  limited?: boolean;
  owner_name?: string;
  company_name?: string | null;
  dot_number?: string | null;
  mc_number?: string | null;
  truck_type?: string;
  truck_count?: number;
  service_area?: string;
  current_location?: string | null;
  availability?: string;
  info_request_note?: string | null;
};

export const Route = createFileRoute("/drivers/status")({
  validateSearch: stringParams("token", "id"),
  head: () => ({
    meta: [
      { title: "Application status | AM Consulting & Hauling" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: StatusPage,
});

const STEPS = ["new", "reviewed", "approved"];

function StatusPage() {
  const { token, id } = Route.useSearch();
  const [reg, setReg] = useState<Reg | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [resent, setResent] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    // Remove the token from the address bar/history once read.
    window.history.replaceState(null, "", "/drivers/status");
    fetch(`/api/public/driver-status?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) =>
        j.ok ? setReg(j.registration) : setError(j.error ?? "This link is invalid or has expired."),
      )
      .catch(() => setError("Network error. Please try again."))
      .finally(() => setLoading(false));
  }, [token]);

  async function lookup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/driver-status?id=${encodeURIComponent(String(fd.get("ref")).trim())}&email=${encodeURIComponent(String(fd.get("email")).trim())}`,
      );
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Not found");
      setReg(j.registration);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function resend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const r = await postJson<{ message: string }>("/api/public/driver-status", {
        id: String(fd.get("resendRef")).trim(),
        email: String(fd.get("resendEmail")).trim(),
      });
      setResent(r.message);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const stepIndex = reg
    ? reg.status === "info_requested"
      ? 1
      : reg.status === "rejected" || reg.status === "archived"
        ? 2
        : Math.max(0, STEPS.indexOf(reg.status))
    : 0;

  return (
    <section className="bg-surface pb-20 pt-32">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <h1 className="text-3xl font-extrabold text-navy">Application status</h1>
        <p className="mt-2 text-muted-foreground">
          Use the private link from your confirmation email, or look up your status with your
          registration reference and email.
        </p>
        {loading && (
          <p role="status" className="mt-6 flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </p>
        )}
        {reg ? (
          <div
            className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
            role="status"
          >
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Current status
            </div>
            <div className="mt-1 text-2xl font-bold text-navy">{reg.statusLabel}</div>
            <ol className="mt-5 grid grid-cols-3 gap-2 text-xs" aria-label="Progress">
              {[
                "Received",
                "Under review",
                reg.status === "rejected"
                  ? "Not approved"
                  : reg.status === "archived"
                    ? "Closed"
                    : "Approved",
              ].map((label, i) => (
                <li
                  key={label}
                  className={`rounded-md border px-2 py-2 text-center ${i <= stepIndex ? "border-navy bg-navy text-white" : "border-border text-muted-foreground"}`}
                  aria-current={i === stepIndex ? "step" : undefined}
                >
                  {label}
                </li>
              ))}
            </ol>
            {reg.info_request_note && (
              <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
                <strong>We need more information:</strong>
                <p className="mt-1 whitespace-pre-wrap">{reg.info_request_note}</p>
                <p className="mt-2">
                  Reply to our email or{" "}
                  <Link to="/contact" className="underline">
                    contact us
                  </Link>
                  .
                </p>
              </div>
            )}
            {!reg.limited ? (
              <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                {[
                  ["Owner", reg.owner_name],
                  ["Company", reg.company_name || "—"],
                  ["USDOT", reg.dot_number || "—"],
                  ["MC", reg.mc_number || "—"],
                  ["Dump trucks", `${reg.truck_count} × ${labelsFor(TRUCK_TYPES, reg.truck_type)}`],
                  ["Current location", reg.current_location || "—"],
                  ["Service area", reg.service_area],
                  ["Availability", labelsFor(AVAILABILITY, reg.availability)],
                  ["Submitted", new Date(reg.created_at).toLocaleDateString()],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden />
                For your privacy, reference lookups show status only. Use your emailed link to see
                full details.
              </p>
            )}
          </div>
        ) : (
          !loading && (
            <>
              <form
                onSubmit={lookup}
                className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-6"
              >
                <Field label="Registration reference" name="ref" required>
                  {(p) => (
                    <input
                      {...p}
                      defaultValue={id}
                      className={`${fieldCls} font-mono`}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    />
                  )}
                </Field>
                <Field label="Email used to register" name="email" required>
                  {(p) => <input {...p} type="email" autoComplete="email" className={fieldCls} />}
                </Field>
                <FormError message={error} />
                <Button type="submit" className="bg-navy text-white hover:bg-navy/90">
                  Check status
                </Button>
              </form>
              <details className="mt-4 rounded-2xl border border-border bg-card p-6">
                <summary className="cursor-pointer font-medium text-navy">
                  Lost your link? Email me a new secure link
                </summary>
                {resent ? (
                  <p role="status" className="mt-3 text-sm">
                    {resent}
                  </p>
                ) : (
                  <form onSubmit={resend} className="mt-4 space-y-4">
                    <Field label="Registration reference" name="resendRef" required>
                      {(p) => <input {...p} className={`${fieldCls} font-mono`} />}
                    </Field>
                    <Field label="Email used to register" name="resendEmail" required>
                      {(p) => <input {...p} type="email" className={fieldCls} />}
                    </Field>
                    <Button type="submit" variant="outline">
                      Email me a link
                    </Button>
                  </form>
                )}
              </details>
            </>
          )
        )}
      </div>
    </section>
  );
}
