import { createFileRoute } from "@tanstack/react-router";
import { Contact } from "@/components/site/Contact";
import { pageHead } from "@/lib/content/site";

export const Route = createFileRoute("/contact")({
  head: ({ matches }) => pageHead("/contact", matches),
  component: () => (
    <div className="pt-16">
      <Contact />
    </div>
  ),
});
