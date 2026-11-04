import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { pageHead, useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/terms")({
  head: ({ matches }) =>
    pageHead("/terms", matches, {
      title: "Terms of Use | AM Consulting LLC",
      description: "Terms governing use of the AM Consulting LLC website.",
    }),
  component: Page,
});

function Page() {
  const c = useSiteContent()["legal.terms"];
  return <LegalPage title={c.title} lastUpdated={c.lastUpdated} body={c.body} />;
}
