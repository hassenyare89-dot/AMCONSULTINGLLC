import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { serviceIcon } from "@/components/site/Services";
import { DEFAULT_CONTENT } from "@/lib/content/defaults";
import { getSiteContent } from "@/lib/api/content.functions";
import { pageHead, useSiteContent, type SiteData } from "@/lib/content/site";

export const Route = createFileRoute("/services/$slug")({
  loader: async ({ params }) => {
    const { content } = await getSiteContent().catch(() => ({ content: DEFAULT_CONTENT }));
    if (!content.services.items.some((s) => s.slug === params.slug)) throw notFound();
    return null;
  },
  head: ({ matches, params }) => {
    const root = matches.find((m) => (m.routeId as string) === "__root__")?.loaderData as
      SiteData | undefined;
    const svc = (root?.content ?? DEFAULT_CONTENT).services.items.find(
      (s) => s.slug === params.slug,
    );
    return pageHead(
      `/services/${params.slug}`,
      matches,
      svc
        ? { title: `${svc.title} | AM Consulting & Hauling`, description: svc.summary }
        : { title: "Service not found | AM Consulting & Hauling", noindex: true },
    );
  },
  component: ServiceDetail,
});

function ServiceDetail() {
  const { slug } = Route.useParams();
  const c = useSiteContent();
  const svc = c.services.items.find((s) => s.slug === slug);
  if (!svc) throw notFound();
  const Icon = serviceIcon(svc.slug);
  const others = c.services.items.filter((s) => s.slug !== slug).slice(0, 3);
  return (
    <article className="pt-16">
      <header className="py-16 text-white sm:py-20" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Link
            to="/services"
            className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white focus-visible:focus-brand rounded"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> All services
          </Link>
          <div className="mt-6 flex items-center gap-4">
            <span
              className="grid h-14 w-14 place-items-center rounded-xl bg-brand-green text-navy-deep"
              aria-hidden
            >
              <Icon className="h-7 w-7" />
            </span>
            <h1 className="text-3xl font-extrabold sm:text-5xl">{svc.title}</h1>
          </div>
          <p className="mt-5 max-w-2xl text-lg text-white/85">{svc.summary}</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div className="lg:col-span-2">
          <h2 className="text-2xl font-bold text-navy">Overview</h2>
          <p className="mt-4 leading-relaxed text-charcoal">{svc.description}</p>
          {svc.process.length > 0 && (
            <>
              <h2 className="mt-10 text-2xl font-bold text-navy">How it works</h2>
              <ol className="mt-4 space-y-3">
                {svc.process.map((p, i) => (
                  <li key={p} className="flex gap-3">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{p}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
        <aside className="space-y-6">
          {svc.benefits.length > 0 && (
            <section
              className="rounded-2xl border border-border bg-surface p-6"
              aria-labelledby="benefits-title"
            >
              <h2 id="benefits-title" className="font-bold text-navy">
                Benefits
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {svc.benefits.map((b) => (
                  <li key={b} className="flex gap-2">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-ink"
                      aria-hidden
                    />
                    {b}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="rounded-2xl bg-navy p-6 text-white">
            <h2 className="font-bold">Ready to talk?</h2>
            <p className="mt-2 text-sm text-white/85">
              Tell us about your project and we'll follow up.
            </p>
            <Button
              asChild
              className="mt-4 w-full bg-brand-green text-navy-deep hover:bg-brand-green/90"
            >
              <Link to="/quote" search={{ service: svc.slug }}>
                Request a quote
              </Link>
            </Button>
            <Button asChild variant="link" className="mt-1 w-full text-white">
              <Link to="/contact">Contact our team</Link>
            </Button>
          </div>
        </aside>
      </div>
      {others.length > 0 && (
        <nav aria-label="Other services" className="border-t border-border bg-surface py-12">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-lg font-bold text-navy">Other services</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-3">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link
                    to="/services/$slug"
                    params={{ slug: o.slug }}
                    className="block rounded-xl border border-border bg-card p-4 font-semibold text-navy hover:border-brand-green focus-visible:focus-brand"
                  >
                    {o.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
    </article>
  );
}
