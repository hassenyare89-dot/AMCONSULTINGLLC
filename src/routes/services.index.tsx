import { createFileRoute } from "@tanstack/react-router";
import { Services, SectionHeader } from "@/components/site/Services";
import { CtaBand } from "@/components/site/CtaBand";
import { pageHead, useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/services/")({
  head: ({ matches }) => pageHead("/services", matches),
  component: ServicesPage,
});

function ServicesPage() {
  const c = useSiteContent();
  const s = c["home.sections"];
  return (
    <div className="pt-16">
      <div className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <SectionHeader
          as="h1"
          eyebrow="Services"
          title="Dispatching, hauling & logistics support"
          subtitle={c.services.intro}
        />
      </div>
      <Services content={c.services} heading={false} />
      <CtaBand
        title={s.ctaTitle}
        body={s.ctaBody}
        phone={c["site.brand"].phone}
        phoneE164={c["site.brand"].phoneE164}
      />
    </div>
  );
}
