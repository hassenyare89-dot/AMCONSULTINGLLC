import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { pageHead, useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/privacy/")({
  head: ({ matches }) =>
    pageHead("/privacy", matches, {
      title: "Privacy Policy | AM Consulting LLC",
      description: "How AM Consulting LLC collects, uses, and protects personal information.",
    }),
  component: Page,
});

function Page() {
  const c = useSiteContent()["legal.privacy"];
  return <LegalPage title={c.title} lastUpdated={c.lastUpdated} body={c.body} />;
}
