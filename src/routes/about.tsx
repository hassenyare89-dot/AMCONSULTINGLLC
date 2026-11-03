import { createFileRoute } from "@tanstack/react-router";
import { About } from "@/components/site/About";
import { CtaBand } from "@/components/site/CtaBand";
import { pageHead, useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/about")({
  head: ({ matches }) => pageHead("/about", matches),
  component: AboutPage,
});

function AboutPage() {
  const c = useSiteContent();
  const s = c["home.sections"];
  return (
    <div className="pt-16">
      <About content={c.about} headingLevel="h1" />
      <CtaBand
        title={s.ctaTitle}
        body={s.ctaBody}
        phone={c["site.brand"].phone}
        phoneE164={c["site.brand"].phoneE164}
      />
    </div>
  );
}
