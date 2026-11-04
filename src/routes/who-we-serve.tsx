import { createFileRoute } from "@tanstack/react-router";
import { WhoWeServe } from "@/components/site/WhoWeServe";
import { CtaBand } from "@/components/site/CtaBand";
import { pageHead, useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/who-we-serve")({
  head: ({ matches }) => pageHead("/who-we-serve", matches),
  component: Page,
});

function Page() {
  const c = useSiteContent();
  const s = c["home.sections"];
  return (
    <div className="pt-16">
      <WhoWeServe content={c.who_we_serve} detailed headingLevel="h1" />
      <CtaBand
        title={s.ctaTitle}
        body={s.ctaBody}
        phone={c["site.brand"].phone}
        phoneE164={c["site.brand"].phoneE164}
      />
    </div>
  );
}
