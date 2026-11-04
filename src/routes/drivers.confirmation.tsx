import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, FileCheck, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AVAILABILITY, TRUCK_TYPES, labelFor } from "@/lib/shared/domain";
import { useSiteContent } from "@/lib/content/site";
import { DRIVER_STORAGE_KEY } from "@/components/site/DriverRegistration";

type Summary = {
  ownerName: string;
  companyName?: string;
  email: string;
  dotNumber?: string;
  mcNumber?: string;
  truckType: string;
  truckCount: number;
  serviceArea: string;
  availability: string;
  id?: string | null;
  statusUrl?: string | null;
};

export const Route = createFileRoute("/drivers/confirmation")({
  head: () => ({
    meta: [
      { title: "Registration received | AM Consulting LLC" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmationPage,
});

function ConfirmationPage() {
  const navigate = useNavigate();
  const brand = useSiteContent()["site.brand"];
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    try {
      const raw = sessionStorage.getItem(DRIVER_STORAGE_KEY);
      if (raw) setSummary(JSON.parse(raw) as Summary);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (hydrated && !summary) {
      const t = setTimeout(() => navigate({ to: "/drivers" }), 50);
      return () => clearTimeout(t);
    }
  }, [hydrated, summary, navigate]);
  if (!summary) return <div className="min-h-[60vh] pt-16" />;
  const statusPath = summary.statusUrl
    ? new URL(summary.statusUrl).pathname + new URL(summary.statusUrl).search
    : null;
  return (
    <section className="bg-surface pb-20 pt-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div
          role="status"
          className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]"
        >
          <CheckCircle2 className="h-10 w-10 text-brand-green" aria-hidden />
          <h1 className="mt-4 text-3xl font-extrabold text-navy">
            Registration received, {summary.ownerName}.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Our team will review your submission and contact you at <strong>{summary.email}</strong>
            , usually within one business day.
          </p>
          <dl className="mt-6 grid gap-3 rounded-xl bg-surface p-5 text-sm sm:grid-cols-2">
            {[
              ["Company", summary.companyName || "—"],
              ["USDOT", summary.dotNumber || "Not provided"],
              ["MC", summary.mcNumber || "Not provided"],
              ["Truck", `${labelFor(TRUCK_TYPES, summary.truckType)} × ${summary.truckCount}`],
              ["Service area", summary.serviceArea],
              ["Availability", labelFor(AVAILABILITY, summary.availability)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {summary.id && (
            <p className="mt-4 text-sm">
              Your registration reference:{" "}
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono">{summary.id}</code>
            </p>
          )}
          <h2 className="mt-8 text-lg font-bold text-navy">What happens next</h2>
          <ol className="mt-3 space-y-3 text-sm">
            <li className="flex gap-3">
              <FileCheck className="h-5 w-5 shrink-0 text-brand-green-ink" aria-hidden />
              <span>
                <strong>Review</strong> — we review your details and may ask for documents such as
                proof of insurance and a W-9.
              </span>
            </li>
            <li className="flex gap-3">
              <Phone className="h-5 w-5 shrink-0 text-brand-green-ink" aria-hidden />
              <span>
                <strong>Conversation</strong> — a coordinator confirms your equipment, availability
                and service area.
              </span>
            </li>
            <li className="flex gap-3">
              <ClipboardList className="h-5 w-5 shrink-0 text-brand-green-ink" aria-hidden />
              <span>
                <strong>Decision</strong> — you'll receive an email when your status changes.
              </span>
            </li>
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            {statusPath ? (
              <Button asChild className="bg-navy text-white hover:bg-navy/90">
                <a href={statusPath}>Check application status</a>
              </Button>
            ) : (
              <Button asChild className="bg-navy text-white hover:bg-navy/90">
                <Link to="/drivers/status">Check application status</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <a href={`tel:${brand.phoneE164}`}>Call {brand.phone}</a>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Your private status link is also in your confirmation email (if email delivery is
            enabled). Don't share it.
          </p>
        </div>
      </div>
    </section>
  );
}
