import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { safeUrl } from "@/lib/shared/sanitize";

/** Truck emblem from the brand logo (transparent PNG in public/media). */
const LOGO_MARK = "/media/logo-mark.png";

/**
 * Brand lockup: the truck emblem with "AM CONSULTING & HAULING" set as live text, so it stays
 * crisp and readable at header size (the full logo's tagline would be illegible there).
 * A logo uploaded in the CMS (Brand → Logo) replaces the lockup with that image.
 */
export function Logo({
  light = false,
  src,
  name = "AM Consulting LLC",
}: {
  light?: boolean;
  src?: string;
  name?: string;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const custom = src ? safeUrl(src) : null;
  // The image may fail before hydration (onError never fires) — check once mounted.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);

  return (
    <Link
      to="/"
      className="group flex items-center rounded-md focus-visible:focus-brand"
      // A custom image logo needs an explicit name; the text lockup names itself
      // (WCAG 2.5.3: the accessible name must contain the visible text).
      aria-label={custom && !failed ? `${name} home` : undefined}
    >
      <span
        className={`inline-flex items-center rounded-lg transition-colors ${light ? "bg-white/95 px-2.5 py-1 shadow-[0_4px_18px_-6px_rgba(0,0,0,0.45)]" : ""}`}
      >
        {custom && !failed ? (
          <img
            ref={img}
            src={custom}
            alt=""
            aria-hidden="true"
            className="h-10 w-auto transition-transform group-hover:scale-[1.03]"
            width={160}
            height={40}
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="flex items-center gap-2.5">
            {failed ? (
              <span
                className="grid h-9 w-9 place-items-center rounded-md bg-charcoal text-white"
                aria-hidden="true"
              >
                <Truck className="h-5 w-5" />
              </span>
            ) : (
              <img
                ref={img}
                src={LOGO_MARK}
                alt=""
                aria-hidden="true"
                className="h-10 w-auto transition-transform duration-300 group-hover:-translate-x-0.5 sm:h-11"
                width={524}
                height={284}
                onError={() => setFailed(true)}
              />
            )}
            <span className="flex flex-col leading-none text-charcoal">
              <span className="font-display text-[0.95rem] font-extrabold uppercase tracking-[0.14em] sm:text-base">
                AM Consulting
              </span>
              <span className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-slate-600">
                &amp; Hauling
              </span>
            </span>
            <span className="sr-only"> home</span>
          </span>
        )}
      </span>
    </Link>
  );
}
