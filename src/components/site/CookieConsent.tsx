import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRIVACY_POLICY_VERSION } from "@/lib/shared/domain";

export const CONSENT_KEY = "amc_cookie_consent";

/**
 * First-visit cookie notice. The site uses only strictly necessary storage, so accepting
 * acknowledges the Privacy and Cookie policies; the choice (with the policy version) is kept in
 * localStorage and the notice returns when the policy version changes. Non-blocking region.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null") as {
        version?: string;
      } | null;
      setShow(saved?.version !== PRIVACY_POLICY_VERSION);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const accept = () => {
    try {
      localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ version: PRIVACY_POLICY_VERSION, acceptedAt: new Date().toISOString() }),
      );
    } catch {
      /* storage unavailable: hide for this page view only */
    }
    setShow(false);
  };

  return (
    <section
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-border bg-white p-4 text-sm text-charcoal shadow-[0_20px_50px_-15px_rgba(0,0,0,0.45)] sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <Cookie className="hidden h-8 w-8 shrink-0 text-navy sm:block" aria-hidden />
        <p className="flex-1 leading-relaxed">
          We use only essential cookies and similar storage to run this website — no advertising or
          analytics cookies. By continuing, you agree to our{" "}
          <Link to="/privacy" className="font-semibold text-navy underline underline-offset-2">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link to="/cookies" className="font-semibold text-navy underline underline-offset-2">
            Cookie Policy
          </Link>
          .
        </p>
        <Button onClick={accept} className="shrink-0 bg-navy px-6 text-white hover:bg-navy/90">
          Accept
        </Button>
      </div>
    </section>
  );
}
