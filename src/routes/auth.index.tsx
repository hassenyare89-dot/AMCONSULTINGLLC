import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { stringParams } from "@/lib/shared/search";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthCard } from "@/components/site/AuthCard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, FormError, fieldCls, postJson } from "@/components/site/forms";

export const Route = createFileRoute("/auth/")({
  validateSearch: stringParams("reason"),
  head: () => ({
    meta: [
      { title: "Staff sign in | AM Consulting LLC" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { reason } = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const r = await postJson<{ session: { access_token: string; refresh_token: string } }>(
        "/api/auth/sign-in",
        { email: fd.get("email"), password: fd.get("password") },
      );
      const { error } = await supabase.auth.setSession(r.session);
      if (error) throw error;
      navigate({ to: "/admin" });
    } catch (err) {
      setError((err as Error).message ?? "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Staff sign in"
      subtitle="AM Consulting Management System — authorised staff only."
    >
      {reason === "timeout" && (
        <p role="status" className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          You were signed out after a period of inactivity.
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="Email" name="email" required>
          {(p) => <input {...p} type="email" autoComplete="username" className={fieldCls} />}
        </Field>
        <Field label="Password" name="password" required>
          {(p) => (
            <input {...p} type="password" autoComplete="current-password" className={fieldCls} />
          )}
        </Field>
        <FormError message={error} />
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-navy text-white hover:bg-navy/90"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Sign in
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/auth/reset" className="text-navy underline">
          Forgot your password?
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Accounts are created by an administrator. Two-step verification is required after sign-in.
      </p>
    </AuthCard>
  );
}
