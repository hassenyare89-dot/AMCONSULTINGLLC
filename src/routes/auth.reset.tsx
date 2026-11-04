import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, fieldCls, postJson } from "@/components/site/forms";
import { AuthCard } from "@/components/site/AuthCard";

export const Route = createFileRoute("/auth/reset")({
  head: () => ({
    meta: [
      { title: "Reset password | AM Consulting LLC" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthCard title="Reset password" subtitle="We'll email a reset link if the account exists.">
      {done ? (
        <p role="status" className="mt-6 text-sm">
          {done}
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const r = await postJson<{ message: string }>("/api/auth/reset", {
                email: new FormData(e.currentTarget).get("email"),
              });
              setDone(r.message);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Email" name="email" required>
            {(p) => <input {...p} type="email" autoComplete="username" className={fieldCls} />}
          </Field>
          <FormError message={error} />
          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-navy text-white hover:bg-navy/90"
          >
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
