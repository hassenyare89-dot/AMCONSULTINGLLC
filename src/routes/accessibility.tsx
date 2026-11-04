import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { pageHead, useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/accessibility")({
  head: ({ matches }) =>
    pageHead("/accessibility", matches, {
      title: "Accessibility Statement | AM Consulting & Hauling",
      description: "Our commitment to an accessible website and how to request assistance.",
    }),
  component: Page,
});

function Page() {
  const c = useSiteContent()["legal.accessibility"];
  return <LegalPage title={c.title} lastUpdated={c.lastUpdated} body={c.body} />;
}
