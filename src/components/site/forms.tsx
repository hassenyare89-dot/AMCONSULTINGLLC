import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const fieldCls =
  "w-full rounded-md border border-input bg-white px-3 py-2.5 text-sm text-charcoal shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:opacity-60 aria-[invalid=true]:border-destructive";

export type FieldErrors = Record<string, string>;

export class SubmitError extends Error {
  field?: string;
  code?: string;
  constructor(message: string, field?: string, code?: string) {
    super(message);
    this.field = field;
    this.code = code;
  }
}

/** POST JSON to a public endpoint; throws SubmitError with the server's safe message. */
export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SubmitError("Network error. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    code?: string;
    details?: { field?: string };
  } & T;
  if (!res.ok || !json.ok)
    throw new SubmitError(
      json.error || "Something went wrong. Please try again.",
      json.details?.field,
      json.code,
    );
  return json;
}

/** Time-trap timestamp + honeypot for bot filtering (paired with server checks). */
export function useSpamGuard() {
  const ts = useRef<number>(Date.now());
  const reset = useCallback(() => (ts.current = Date.now()), []);
  return { ts, reset };
}

export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label htmlFor="website">Website (leave blank)</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}

export function Field({
  label,
  name,
  required,
  error,
  help,
  children,
  className,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  help?: ReactNode;
  children: (props: {
    id: string;
    name: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    required?: boolean;
  }) => ReactNode;
  className?: string;
}) {
  const id = `fld-${name}`;
  const describedBy =
    [error && `${id}-err`, help && `${id}-help`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-charcoal">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        )}
      </label>
      {children({
        id,
        name,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        required,
      })}
      {help && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function ConsentCheckbox({
  name = "consentPrivacy",
  required = true,
  error,
  children,
}: {
  name?: string;
  required?: boolean;
  error?: string;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          value="true"
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className="mt-1 h-4 w-4 rounded border-input accent-[var(--navy)]"
        />
        <label htmlFor={id} className="text-sm text-charcoal">
          {children ?? (
            <>
              I have read the{" "}
              <Link to="/privacy" className="font-medium text-navy underline" target="_blank">
                Privacy Policy
              </Link>{" "}
              and agree that AM Consulting LLC may use this information to respond to my request.
            </>
          )}
          {required && (
            <span className="text-destructive" aria-hidden>
              {" "}
              *
            </span>
          )}
        </label>
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

/** Focus the first invalid field and announce errors (WCAG 3.3.1). */
export function focusFirstError(errors: FieldErrors) {
  const first = Object.keys(errors)[0];
  if (first) requestAnimationFrame(() => document.getElementById(`fld-${first}`)?.focus());
}

export function zodErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

/** Optional Cloudflare Turnstile widget (renders only when VITE_TURNSTILE_SITE_KEY is set). */
export function Turnstile({ onToken }: { onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!TURNSTILE_KEY) return;
    const w = window as unknown as { turnstile?: { render: (el: HTMLElement, o: object) => void } };
    const render = () => {
      if (ref.current && w.turnstile && !ref.current.hasChildNodes())
        w.turnstile.render(ref.current, { sitekey: TURNSTILE_KEY, callback: onToken });
    };
    if (w.turnstile) return render();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.onload = () => {
      setLoaded(true);
      render();
    };
    document.head.appendChild(s);
  }, [onToken, loaded]);
  if (!TURNSTILE_KEY) return null;
  return <div ref={ref} className="min-h-16" />;
}
