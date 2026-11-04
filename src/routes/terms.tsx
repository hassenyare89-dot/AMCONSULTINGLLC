import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { pageHead, useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/terms")({
  head: ({ matches }) =>
    pageHead("/terms", matches, {
      title: "Terms of Use | AM Consulting & Hauling",
      description: "Terms governing use of the AM Consulting & Hauling website.",
    }),
  component: Page,
});

function Page() {
  const c = useSiteContent()["legal.terms"];
  return <LegalPage title={c.title} lastUpdated={c.lastUpdated} body={c.body} />;
}
