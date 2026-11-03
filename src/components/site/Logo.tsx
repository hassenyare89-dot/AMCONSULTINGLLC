import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import logo from "@/assets/am-logo-full.png.asset.json";
import { safeUrl } from "@/lib/shared/sanitize";

/** Brand logo. Uses the CMS logo if set, else the original asset; falls back to a wordmark if it fails to load. */
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
  // The image may fail before hydration (onError never fires) — check once mounted.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  const url = src ? safeUrl(src) : logo.url;
  return (
    <Link
      to="/"
      className="group flex items-center rounded-md focus-visible:focus-brand"
      aria-label={`${name} home`}
    >
      <span
        className={`inline-flex items-center rounded-md transition-colors ${light ? "bg-white/95 px-2 py-1 shadow-[0_4px_18px_-6px_rgba(0,0,0,0.45)]" : ""}`}
      >
        {failed ? (
          <span className="flex items-center gap-2 px-1 py-1" aria-hidden="true">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-navy text-sm font-extrabold text-white">
              AM
            </span>
            <span className="font-display text-base font-extrabold text-navy">{name}</span>
          </span>
        ) : (
          <img
            ref={img}
            src={url}
            alt=""
            aria-hidden="true"
            className="h-10 w-auto transition-transform group-hover:scale-[1.03]"
            width={160}
            height={40}
            onError={() => setFailed(true)}
          />
        )}
      </span>
    </Link>
  );
}
