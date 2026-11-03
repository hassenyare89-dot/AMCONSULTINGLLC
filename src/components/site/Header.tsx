import { useEffect, useState } from "react";
import { Menu, Phone, X } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useSiteContent } from "@/lib/content/site";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";

export const NAV = [
  { label: "Home", to: "/" },
  { label: "Services", to: "/services" },
  { label: "About", to: "/about" },
  { label: "Who We Serve", to: "/who-we-serve" },
  { label: "How It Works", to: "/process" },
  { label: "Drivers", to: "/drivers" },
  { label: "FAQs", to: "/faq" },
  { label: "Contact", to: "/contact" },
] as const;

const MOBILE_NAV_ID = "primary-mobile-nav";

export function Header() {
  const brand = useSiteContent()["site.brand"];
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const solid = scrolled || !isHome || open;
  const linkActive = "underline decoration-brand-green decoration-2 underline-offset-[6px]";

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-navy focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${solid ? "glass-panel shadow-[0_8px_30px_-20px_rgba(7,42,108,0.35)]" : "bg-transparent"}`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo light={!solid} src={brand.logoUrl} name={brand.companyName} />
          <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: linkActive, "aria-current": "page" }}
                className={`rounded-md px-2.5 py-2 text-sm font-medium transition-colors hover:underline hover:decoration-brand-green hover:decoration-2 hover:underline-offset-[6px] focus-visible:focus-brand ${solid ? "text-navy" : "text-white"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 xl:flex">
            <a
              href={`tel:${brand.phoneE164}`}
              aria-label={`Call ${brand.companyName} at ${brand.phone}`}
              className={`inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold hover:underline focus-visible:focus-brand ${solid ? "text-navy" : "text-white"}`}
            >
              <Phone className="h-4 w-4" aria-hidden="true" /> {brand.phone}
            </a>
            <Button
              asChild
              className="bg-brand-green text-navy-deep shadow-[var(--shadow-glow)] hover:bg-brand-green/90"
            >
              <Link to="/quote">Request a Quote</Link>
            </Button>
          </div>
          <button
            type="button"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            aria-controls={MOBILE_NAV_ID}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-md focus-visible:focus-brand xl:hidden ${solid ? "text-navy" : "text-white"}`}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>
        <nav
          id={MOBILE_NAV_ID}
          aria-label="Mobile primary"
          hidden={!open}
          className="glass-panel max-h-[calc(100svh-4rem)] overflow-y-auto border-t border-border xl:hidden"
        >
          <div className="flex flex-col gap-1 px-4 py-4">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ "aria-current": "page", className: linkActive }}
                className="flex min-h-11 items-center rounded-md px-3 py-3 font-medium text-navy transition-colors hover:bg-secondary focus-visible:focus-brand"
              >
                {item.label}
              </Link>
            ))}
            <a
              href={`tel:${brand.phoneE164}`}
              className="flex min-h-11 items-center gap-2 rounded-md px-3 font-semibold text-navy"
            >
              <Phone className="h-4 w-4" aria-hidden /> {brand.phone}
            </a>
            <Button asChild className="mt-2 bg-brand-green text-navy-deep hover:bg-brand-green/90">
              <Link to="/quote" onClick={() => setOpen(false)}>
                Request a Quote
              </Link>
            </Button>
          </div>
        </nav>
      </header>
    </>
  );
}
