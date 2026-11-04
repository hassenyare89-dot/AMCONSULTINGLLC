import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getSession, mfaEnroll, mfaVerify } from "@/lib/auth/client";
import { inputCls } from "./kit";

type Mode =
  | { kind: "loading" }
  | { kind: "verify" }
  | { kind: "enroll"; qr: string; secret: string }
  | { kind: "error"; message: string };

/** TOTP enrolment / verification. Staff cannot reach AMCMS data until their session is AAL2. */
export function MfaGate({
  email,
  onDone,
  onSignOut,
}: {
  email: string | null;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session)
        return setMode({ kind: "error", message: "Your session has expired. Sign in again." });
      if (session.mfaEnabled) return setMode({ kind: "verify" });
      try {
        const en = await mfaEnroll();
        setMode({ kind: "enroll", qr: en.qrDataUrl, secret: en.secret });
      } catch (err) {
        setMode({ kind: "error", message: (err as Error).message || "Could not start enrolment." });
      }
    })();
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (mode.kind !== "verify" && mode.kind !== "enroll") return;
    setBusy(true);
    setError(null);
    try {
      await mfaVerify(code.replace(/\s/g, ""));
    } catch (err) {
      setBusy(false);
      setError((err as Error).message || "That code didn't work.");
      return;
    }
    setBusy(false);
    onDone();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2 text-navy">
          <ShieldCheck className="h-6 w-6 text-brand-green" aria-hidden />
          <h1 className="text-xl font-bold">Two-step verification</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Staff accounts ({email}) must use an authenticator app to access the management system.
        </p>
        {mode.kind === "loading" && (
          <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparing…
          </p>
        )}
        {mode.kind === "error" && (
          <p role="alert" className="mt-6 text-sm text-destructive">
            {mode.message}
          </p>
        )}
        {mode.kind === "enroll" && (
          <div className="mt-6 space-y-3">
            <p className="text-sm">
              1. Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password, or
              a similar app.
            </p>
            <img
              src={mode.qr}
              alt="QR code for adding AMCMS to your authenticator app"
              className="mx-auto h-48 w-48 rounded-lg border bg-white p-2"
            />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Can't scan? Enter this key instead</summary>
              <code className="mt-2 block break-all rounded bg-secondary p-2 font-mono">
                {mode.secret}
              </code>
            </details>
            <p className="text-sm">2. Enter the 6-digit code from the app.</p>
          </div>
        )}
        {(mode.kind === "verify" || mode.kind === "enroll") && (
          <form onSubmit={verify} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mfa-code">Authentication code</Label>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                className={`${inputCls} text-center font-mono text-lg tracking-widest`}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-describedby={error ? "mfa-err" : undefined}
                autoFocus
              />
              {error && (
                <p id="mfa-err" role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={busy || code.replace(/\s/g, "").length !== 6}
              className="w-full bg-navy text-white hover:bg-navy/90"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Verify
            </Button>
          </form>
        )}
        <Button variant="ghost" className="mt-4 w-full" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
