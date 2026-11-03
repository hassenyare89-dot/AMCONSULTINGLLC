import { Link } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { safeUrl } from "@/lib/shared/sanitize";

/** Internal paths use the router; anything else is a plain (safe) anchor. */
export function SmartLink({
  href,
  children,
  ...rest
}: { href: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const url = safeUrl(href);
  if (url.startsWith("/")) {
    return (
      <Link to={url as "/"} {...(rest as object)}>
        {children}
      </Link>
    );
  }
  const external = /^https?:/i.test(url);
  return (
    <a href={url} {...rest} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}
