import { createFileRoute } from "@tanstack/react-router";
import { DriverRegistration } from "@/components/site/DriverRegistration";
import { pageHead } from "@/lib/content/site";

export const Route = createFileRoute("/drivers/")({
  head: ({ matches }) => pageHead("/drivers", matches),
  component: () => (
    <div className="pt-16">
      <DriverRegistration />
    </div>
  ),
});
