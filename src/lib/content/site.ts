import { getRouteApi } from "@tanstack/react-router";
import { DEFAULT_CONTENT, type SiteContent } from "./defaults";

export type FaqPublic = { id: string; question: string; answer: string; category: string };
export type SiteData = { content: SiteContent; faqs: FaqPublic[] };

const rootApi = getRouteApi("__root__");

/** Published CMS content (merged over defaults) loaded once by the root route. */
export function useSiteContent(): SiteContent {
  const data = rootApi.useLoaderData() as SiteData | undefined;
  return data?.content ?? (DEFAULT_CONTENT as SiteContent);
}
export function useFaqs(): FaqPublic[] {
  const data = rootApi.useLoaderData() as SiteData | undefined;
  return data?.faqs ?? [];
}

export const SITE_URL = (
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || "https://amconsultingllc.net"
).replace(/\/$/, "");

/** Brand values with derived fields (single source for header, footer, structured data). */
export function brandOf(c: SiteContent) {
  const b = c["site.brand"];
  const q = encodeURIComponent(`${b.addressLine1}, ${b.city}, ${b.state} ${b.zip}`);
  return {
    ...b,
    addressFull: `${b.addressLine1}, ${b.city}, ${b.state} ${b.zip}`,
    mapSearchUrl: `https://www.google.com/maps/search/?api=1&query=${q}`,
    mapEmbedUrl: `https://www.google.com/maps?q=${q}&output=embed`,
  };
}

/** <head> tags for a public page; CMS SEO overrides take precedence over defaults. */
export function pageHead(
  path: string,
  matches: readonly any[] | undefined,
  extra: { title?: string; description?: string; noindex?: boolean } = {},
) {
  const root = matches?.find((m) => m.routeId === "__root__")?.loaderData as SiteData | undefined;
  const pages = (root?.content ?? DEFAULT_CONTENT).seo.pages;
  const fallback = DEFAULT_CONTENT.seo.pages.find((p) => p.path === path);
  const entry = pages.find((p) => p.path === path) ?? fallback;
  const title = extra.title ?? entry?.title ?? "AM Consulting LLC";
  const description =
    extra.description ?? entry?.description ?? DEFAULT_CONTENT.seo.pages[0].description;
  const url = `${SITE_URL}${path === "/" ? "/" : path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      ...(extra.noindex ? [{ name: "robots", content: "noindex,nofollow" }] : []),
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
