import { createFileRoute } from "@tanstack/react-router";
import { Process } from "@/components/site/Process";
import { CtaBand } from "@/components/site/CtaBand";
import { pageHead, useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/process")({
  head: ({ matches }) => pageHead("/process", matches),
  component: Page,
});

function Page() {
  const c = useSiteContent();
  const s = c["home.sections"];
  return (
    <div className="pt-16">
      <Process content={c.process} headingLevel="h1" />
      <CtaBand
        title={s.ctaTitle}
        body={s.ctaBody}
        phone={c["site.brand"].phone}
        phoneE164={c["site.brand"].phoneE164}
      />
    </div>
  );
}
