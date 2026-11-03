import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageHeader, Panel, inputCls } from "@/components/admin/kit";
import { supabase } from "@/integrations/supabase/client";
import { rpc, useRpcMutation } from "@/lib/admin/rpc";
import { useAdminSession } from "@/lib/admin/session";
import { passwordProblems } from "@/lib/shared/password";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/account")({ component: AccountPage });

function AccountPage() {
  const s = useAdminSession();
  const [p, setP] = useState({ fullName: s.fullName ?? "", title: "", phone: "" });
  const save = useRpcMutation("profile.update", {
    invalidate: ["session."],
    success: "Profile saved",
  });
  const [pw, setPw] = useState("");
  const [factors, setFactors] = useState<
    { id: string; friendly_name?: string; created_at: string; status: string }[]
  >([]);
  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => setFactors((data?.all ?? []) as any));
  }, []);
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const problems = passwordProblems(pw, s.email ?? "");
    if (problems.length) return toast.error(problems[0]);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    await rpc("session.event", { event: "password_changed" }).catch(() => {});
    setPw("");
    toast.success("Password updated");
  }
  return (
    <>
      <PageHeader
        title="My account & security"
        description={`${s.email} · ${s.roleLabels.join(", ")}`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Profile">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(p);
            }}
          >
            {(["fullName", "title", "phone"] as const).map((k) => (
              <div key={k}>
                <Label htmlFor={`me-${k}`}>
                  {{ fullName: "Full name", title: "Job title", phone: "Phone" }[k]}
                </Label>
                <input
                  id={`me-${k}`}
                  className={cn(inputCls, "mt-1")}
                  value={p[k]}
                  onChange={(e) => setP({ ...p, [k]: e.target.value })}
                />
              </div>
            ))}
            <Button type="submit" size="sm">
              Save profile
            </Button>
          </form>
        </Panel>
        <Panel title="Password">
          <form className="space-y-3" onSubmit={changePassword}>
            <div>
              <Label htmlFor="newpw">New password</Label>
              <input
                id="newpw"
                type="password"
                autoComplete="new-password"
                className={cn(inputCls, "mt-1")}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                aria-describedby="pwhelp"
              />
            </div>
            <p id="pwhelp" className="text-xs text-muted-foreground">
              At least 12 characters; avoid common or reused passwords.
            </p>
            <Button type="submit" size="sm">
              Change password
            </Button>
          </form>
        </Panel>
        <Panel title="Two-step verification">
          <p className="text-sm">
            Session assurance:{" "}
            <strong>{s.aal === "aal2" ? "verified with authenticator" : "password only"}</strong>
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {factors.map((f) => (
              <li key={f.id}>
                {f.friendly_name ?? "Authenticator"} · {f.status} · added{" "}
                {new Date(f.created_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Lost your device? Ask a Super Admin to reset your MFA factor in the Supabase dashboard
            (Authentication → Users), then sign in again to re-enrol.
          </p>
        </Panel>
      </div>
    </>
  );
}
