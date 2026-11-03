import { Facebook, Instagram, Linkedin, Mail, MapPin, Phone, Twitter } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { brandOf, useSiteContent } from "@/lib/content/site";
import { safeUrl } from "@/lib/shared/sanitize";
import { Logo } from "./Logo";
import { SmartLink } from "./SmartLink";

const nav = [
  { label: "Home", to: "/" },
  { label: "Services", to: "/services" },
  { label: "About", to: "/about" },
  { label: "Who We Serve", to: "/who-we-serve" },
  { label: "How It Works", to: "/process" },
  { label: "FAQs", to: "/faq" },
  { label: "Contact", to: "/contact" },
] as const;
const get = [
  { label: "Request a Quote", to: "/quote" },
  { label: "Book a Consultation", to: "/book" },
  { label: "Register Your Truck", to: "/drivers" },
  { label: "Check Application Status", to: "/drivers/status" },
] as const;
const legal = [
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms of Use", to: "/terms" },
  { label: "Accessibility", to: "/accessibility" },
  { label: "Cookie Policy", to: "/cookies" },
  { label: "Privacy Requests", to: "/privacy/request" },
] as const;

const linkCls =
  "inline-block rounded text-sm text-white/80 transition-colors hover:text-brand-green-soft hover:underline hover:underline-offset-4 focus-visible:focus-brand";

export function Footer() {
  const content = useSiteContent();
  const brand = brandOf(content);
  const social = content["site.social"];
  const socials = [
    { url: social.facebook, Icon: Facebook, label: "Facebook" },
    { url: social.linkedin, Icon: Linkedin, label: "LinkedIn" },
    { url: social.instagram, Icon: Instagram, label: "Instagram" },
    { url: social.x, Icon: Twitter, label: "X (Twitter)" },
  ].filter((s) => s.url);
  return (
    <footer
      className="relative pb-8 pt-20 text-white"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo light src={brand.logoUrl} name={brand.companyName} />
            <p className="mt-4 max-w-sm text-sm text-white/75">{content.footer.blurb}</p>
            {socials.length > 0 && (
              <ul className="mt-5 flex gap-3">
                {socials.map(({ url, Icon, label }) => (
                  <li key={label}>
                    <a
                      href={safeUrl(url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${brand.companyName} on ${label}`}
                      className="glass-dark grid h-9 w-9 place-items-center rounded-lg text-white transition-colors hover:bg-brand-green/30 focus-visible:focus-brand"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <FooterCol title="Company" items={nav} />
          <FooterCol title="Get started" items={get} />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-brand-green-soft">
              Contact
            </h2>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href={`tel:${brand.phoneE164}`}
                  className={`${linkCls} inline-flex items-center gap-2`}
                >
                  <Phone className="h-4 w-4" aria-hidden="true" /> {brand.phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${brand.email}`}
                  className={`${linkCls} inline-flex items-center gap-2 break-all`}
                >
                  <Mail className="h-4 w-4" aria-hidden="true" /> {brand.email}
                </a>
              </li>
              <li>
                <a
                  href={brand.mapSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${linkCls} inline-flex items-start gap-2`}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{brand.addressFull}</span>
                </a>
              </li>
              {brand.hours && <li className="text-sm text-white/70">{brand.hours}</li>}
            </ul>
          </div>
        </div>
        <nav
          aria-label="Legal"
          className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-6"
        >
          {legal.map((l) => (
            <Link key={l.to} to={l.to} className={linkCls}>
              {l.label}
            </Link>
          ))}
          {content.footer.links.map((l) => (
            <SmartLink key={l.href} href={l.href} className={linkCls}>
              {l.label}
            </SmartLink>
          ))}
        </nav>
        <div className="mt-6 flex flex-col items-center justify-between gap-3 text-xs text-white/70 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {brand.legalName || brand.companyName}. All rights
            reserved.
          </p>
          <p>{brand.tagline}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  items,
}: {
  title: string;
  items: readonly { label: string; to: string }[];
}) {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-brand-green-soft">{title}</h2>
      <ul className="mt-4 space-y-2">
        {items.map((n) => (
          <li key={n.to}>
            <Link to={n.to as "/"} className={linkCls}>
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
