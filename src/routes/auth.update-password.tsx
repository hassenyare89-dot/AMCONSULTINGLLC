import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { passwordProblems } from "@/lib/shared/password";
import { Field, FormError, fieldCls } from "@/components/site/forms";
import { AuthCard } from "@/components/site/AuthCard";

/** Landing page for password-recovery and invitation links (Supabase puts the session in the URL). */
export const Route = createFileRoute("/auth/update-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set password | AM Consulting LLC" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) {
        setReady(true);
        setEmail(session.user.email ?? "");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
        setEmail(data.session.user.email ?? "");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return (
    <AuthCard title="Choose a password" subtitle={email ? `For ${email}` : undefined}>
      {!ready ? (
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
            const problems = passwordProblems(pw, email);
            if (problems.length) return setError(problems[0]);
            setBusy(true);
            const { error } = await supabase.auth.updateUser({ password: pw });
            setBusy(false);
            if (error) return setError(error.message);
            navigate({ to: "/admin" });
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
