import { sanitizeHtml } from "@/lib/shared/sanitize";

/** Renders CMS-managed legal copy (sanitized on save and again here). */
export function LegalPage({
  title,
  lastUpdated,
  body,
}: {
  title: string;
  lastUpdated?: string;
  body: string;
}) {
  return (
    <article className="bg-background pb-20 pt-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="text-4xl font-extrabold text-navy">{title}</h1>
        {lastUpdated && (
          <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        )}
        <div
          className="prose-brand mt-8 text-charcoal"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
        />
      </div>
    </article>
  );
}
