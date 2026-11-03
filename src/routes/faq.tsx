import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { pageHead, useFaqs } from "@/lib/content/site";
import { SectionHeader } from "@/components/site/Services";
import { fieldCls } from "@/components/site/forms";

export const Route = createFileRoute("/faq")({
  head: ({ matches }) => {
    const base = pageHead("/faq", matches);
    const root = matches.find((m) => (m.routeId as string) === "__root__")?.loaderData as
      { faqs?: { question: string; answer: string }[] } | undefined;
    const faqs = root?.faqs ?? [];
    return faqs.length
      ? {
          ...base,
          scripts: [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({
                  "@type": "Question",
                  name: f.question,
                  acceptedAnswer: { "@type": "Answer", text: f.answer },
                })),
              }).replace(/</g, "\\u003c"),
            },
          ],
        }
      : base;
  },
  component: FaqPage,
});

function FaqPage() {
  const faqs = useFaqs();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? faqs.filter((f) => `${f.question} ${f.answer}`.toLowerCase().includes(t)) : faqs;
  }, [faqs, q]);
  const groups = useMemo(() => [...new Set(shown.map((f) => f.category))], [shown]);
  return (
    <section className="bg-background pb-20 pt-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeader as="h1" eyebrow="FAQs" title="Frequently asked questions" />
        <div className="relative mt-8">
          <Search
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500"
            aria-hidden
          />
          <label htmlFor="faq-search" className="sr-only">
            Search FAQs
          </label>
          <input
            id="faq-search"
            type="search"
            className={`${fieldCls} pl-9`}
            placeholder="Search questions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
          {faqs.length ? `${shown.length} of ${faqs.length} questions` : ""}
        </p>
        {!faqs.length ? (
          <p className="mt-8 rounded-xl border border-border bg-surface p-6 text-muted-foreground">
            Our FAQ is being prepared. In the meantime,{" "}
            <Link to="/contact" className="text-navy underline">
              contact our team
            </Link>{" "}
            with any question.
          </p>
        ) : !shown.length ? (
          <p className="mt-8 text-muted-foreground">
            No questions match “{q}”.{" "}
            <Link to="/contact" className="text-navy underline">
              Ask us directly
            </Link>
            .
          </p>
        ) : (
          groups.map((g) => (
            <div key={g} className="mt-8">
              {groups.length > 1 && (
                <h2 className="mb-2 text-lg font-bold capitalize text-navy">{g}</h2>
              )}
              <Accordion type="multiple" className="rounded-xl border border-border bg-card px-4">
                {shown
                  .filter((f) => f.category === g)
                  .map((f) => (
                    <AccordionItem key={f.id} value={f.id}>
                      <AccordionTrigger className="text-left font-semibold text-navy">
                        {f.question}
                      </AccordionTrigger>
                      <AccordionContent>
                        {f.answer.split(/\n{2,}/).map((p, i) => (
                          <p key={i} className="mb-3 whitespace-pre-line text-charcoal">
                            {p}
                          </p>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
