import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { safeUrl } from "@/lib/shared/sanitize";

/** Official logo with a genuine alpha channel (background removed from the artwork's pixels). */
const LOGO = {
  webp: "/media/am-consulting-logo-transparent.webp",
  png: "/media/am-consulting-logo-transparent.png",
  width: 720,
  height: 305,
};
const ALT = "AM Consulting & Hauling — Efficient, Reliable, On-Time";

const SIZES = {
  // Header bar is 64 px tall; the logo keeps its aspect ratio (object-fit: contain).
  header: "h-12 sm:h-14",
  footer: "h-20 sm:h-24",
} as const;

/**
 * Brand logo, shown directly on the page — no card, pill, border or shadow behind it.
 * A logo uploaded in the CMS (Brand → Logo) replaces it; a text wordmark is the fallback.
 */
export function Logo({
  src,
  name = "AM Consulting & Hauling",
  size = "header",
}: {
  src?: string;
  name?: string;
  size?: keyof typeof SIZES;
  /** @deprecated kept for call-site compatibility; the transparent logo needs no backing. */
  light?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const custom = src ? safeUrl(src) : null;
  // The image may fail before hydration (onError never fires) — check once mounted.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);

  const imgCls = `${SIZES[size]} w-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]`;
  return (
    <Link to="/" className="group flex shrink-0 items-center rounded-md focus-visible:focus-brand">
      {failed ? (
        <span className="flex items-center gap-2 px-1 py-1">
          <span
            className="grid h-9 w-9 place-items-center rounded-md bg-charcoal text-white"
            aria-hidden="true"
          >
            <Truck className="h-5 w-5" />
          </span>
          <span className="font-display text-base font-extrabold uppercase tracking-wider text-current">
            {name}
          </span>
        </span>
      ) : custom ? (
        <img ref={img} src={custom} alt={name} className={imgCls} onError={() => setFailed(true)} />
      ) : (
        <picture>
          <source srcSet={LOGO.webp} type="image/webp" />
          <img
            ref={img}
            src={LOGO.png}
            alt={ALT}
            width={LOGO.width}
            height={LOGO.height}
            decoding="async"
            fetchPriority={size === "header" ? "high" : "auto"}
            className={imgCls}
            onError={() => setFailed(true)}
          />
        </picture>
      )}
      <span className="sr-only"> home</span>
    </Link>
  );
}
