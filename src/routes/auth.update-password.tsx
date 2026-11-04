import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { completeToken, signIn } from "@/lib/auth/client";
import { stringParams } from "@/lib/shared/search";
import { passwordProblems } from "@/lib/shared/password";
import { Field, FormError, fieldCls } from "@/components/site/forms";
import { AuthCard } from "@/components/site/AuthCard";

/** Landing page for password-reset and invitation links (one-time token in the URL). */
export const Route = createFileRoute("/auth/update-password")({
  ssr: false,
  validateSearch: stringParams("token", "invite"),
  head: () => ({
    meta: [
      { title: "Set password | AM Consulting & Hauling" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const navigate = useNavigate();
  const { token, invite } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthCard
      title={invite ? "Activate your account" : "Choose a password"}
      subtitle={invite ? "Set a password to finish setting up your AMCMS account." : undefined}
    >
      {!token ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Open this page from the link in your email. Links expire after a short time — request a
          new one if needed.
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const pw = String(fd.get("password") ?? "");
            if (pw !== String(fd.get("confirm") ?? "")) return setError("Passwords don't match.");
            const problems = passwordProblems(pw);
            if (problems.length) return setError(problems[0]);
            setBusy(true);
            setError(null);
            try {
              const r = await completeToken(token, pw);
              await signIn(r.email, pw);
              navigate({ to: "/admin" });
            } catch (err) {
              setError((err as Error).message || "Could not save your password.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="New password" name="password" required help="At least 12 characters.">
            {(p) => (
              <input {...p} type="password" autoComplete="new-password" className={fieldCls} />
            )}
          </Field>
          <Field label="Confirm password" name="confirm" required>
            {(p) => (
              <input {...p} type="password" autoComplete="new-password" className={fieldCls} />
            )}
          </Field>
          <FormError message={error} />
          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-navy text-white hover:bg-navy/90"
          >
            Save password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
