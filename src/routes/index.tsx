import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/site/Hero";
import { Stats } from "@/components/site/Stats";
import { Services } from "@/components/site/Services";
import { WhoWeServe } from "@/components/site/WhoWeServe";
import { WhyUs } from "@/components/site/WhyUs";
import { Process } from "@/components/site/Process";
import { CtaBand } from "@/components/site/CtaBand";
import { pageHead, useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/")({
  head: ({ matches }) => pageHead("/", matches),
  component: Index,
});

function Index() {
  const c = useSiteContent();
  const s = c["home.sections"];
  const brand = c["site.brand"];
  return (
    <>
      <Hero content={c["home.hero"]} />
      {s.showHighlights && <Stats content={c["home.highlights"]} />}
      {s.showServices && <Services content={c.services} />}
      {s.showWhoWeServe && <WhoWeServe content={c.who_we_serve} />}
      {s.showWhyUs && <WhyUs content={c.why_us} companyName={brand.companyName} />}
      {s.showProcess && <Process content={c.process} />}
      {s.showCta && (
        <CtaBand
          title={s.ctaTitle}
          body={s.ctaBody}
          phone={brand.phone}
          phoneE164={brand.phoneE164}
        />
      )}
    </>
  );
}
