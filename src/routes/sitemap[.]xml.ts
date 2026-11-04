import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { getPublicSiteContent } = await import("@/server/services/cms.server");
        const { SITE_URL } = await import("@/lib/content/site");
        const { content } = await getPublicSiteContent();
        const paths = [
          "/",
          "/about",
          "/services",
          ...content.services.items.map((s) => `/services/${s.slug}`),
          "/who-we-serve",
          "/process",
          "/quote",
          "/book",
          "/drivers",
          "/faq",
          "/contact",
          "/privacy",
          "/terms",
          "/accessibility",
          "/cookies",
        ];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n")}\n</urlset>\n`;
        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
