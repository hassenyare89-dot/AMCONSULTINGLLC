import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "AMCMS | AM Consulting LLC" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});
