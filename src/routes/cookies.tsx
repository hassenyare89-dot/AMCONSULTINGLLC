import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { pageHead, useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/cookies")({
  head: ({ matches }) =>
    pageHead("/cookies", matches, {
      title: "Cookie Policy | AM Consulting & Hauling",
      description: "What this website stores on your device and why.",
    }),
  component: Page,
});

function Page() {
  const c = useSiteContent()["legal.cookies"];
  return <LegalPage title={c.title} lastUpdated={c.lastUpdated} body={c.body} />;
}
