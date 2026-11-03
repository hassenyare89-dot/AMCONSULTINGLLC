import { createFileRoute, Link } from "@tanstack/react-router";
import { stringParams } from "@/lib/shared/search";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/components/site/forms";

export const Route = createFileRoute("/book/manage")({
  validateSearch: stringParams("token"),
  head: () => ({
    meta: [
      { title: "Manage consultation | AM Consulting LLC" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ManagePage,
});

function ManagePage() {
  const { token } = Route.useSearch();
  const [appt, setAppt] = useState<{
    name: string;
    topicLabel: string;
    starts_at: string;
    status: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return setError("This link is invalid.");
    fetch(`/api/public/appointment-manage?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setAppt(j.appointment) : setError(j.error)))
      .catch(() => setError("Network error."));
  }, [token]);
  return (
    <section className="bg-surface pb-20 pt-32">
      <div className="mx-auto max-w-xl px-4 sm:px-6">
        <h1 className="text-3xl font-extrabold text-navy">Your consultation</h1>
        {error && (
          <p role="alert" className="mt-6 text-destructive">
            {error}
          </p>
        )}
        {appt && (
          <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-6">
            <p>
              <strong>
                {new Date(appt.starts_at).toLocaleString("en-US", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </strong>
            </p>
            <p className="text-muted-foreground">
              {appt.topicLabel} · status: {appt.status}
            </p>
            {msg ? (
              <p role="status">{msg}</p>
            ) : (
              ["requested", "confirmed"].includes(appt.status) && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await postJson("/api/public/appointment-manage", { token });
                        setMsg("Your consultation has been cancelled.");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Cancel consultation
                  </Button>
                  <Button asChild>
                    <Link to="/book">Book a different time</Link>
                  </Button>
                </div>
              )
            )}
            <p className="text-xs text-muted-foreground">
              To reschedule, book a new time and cancel this one, or reply to your confirmation
              email.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
