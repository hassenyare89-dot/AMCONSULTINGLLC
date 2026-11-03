import type { SiteContent } from "@/lib/content/defaults";

/**
 * Highlights band. Only items an administrator has marked "verified" in the CMS are shown —
 * the original hard-coded figures (500+ loads, 98% on-time, …) were unsubstantiated and removed.
 */
export function Stats({ content }: { content: SiteContent["home.highlights"] }) {
  const items = (content.items ?? []).filter((i) => i.verified && i.value && i.label);
  if (!items.length) return null;
  return (
    <section aria-label="Highlights" className="relative z-10 -mt-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <dl className="glass-panel grid grid-cols-2 gap-8 rounded-3xl p-8 shadow-[var(--shadow-elevated)] sm:p-10 lg:grid-cols-4">
          {items.map((s) => (
            <div key={s.label} className="flex flex-col-reverse text-center">
              <dt className="mt-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </dt>
              <dd className="font-display text-4xl font-extrabold text-navy sm:text-5xl">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
