import { createFileRoute, Link } from "@tanstack/react-router";
import { stringParams } from "@/lib/shared/search";
import {
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/components/admin/kit";
import { ResourceManager } from "@/components/admin/ResourceManager";
import { fmtDateTime, useRpc } from "@/lib/admin/rpc";
import { useAdminSession } from "@/lib/admin/session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/")({
  validateSearch: stringParams("tab"),
  component: Overview,
});

const CARDS: { key: string; label: string; href: string; warn?: boolean }[] = [
  { key: "pendingApplications", label: "Pending driver applications", href: "/admin/drivers" },
  { key: "activeDrivers", label: "Active drivers", href: "/admin/drivers?tab=roster" },
  { key: "activeTrucks", label: "Active trucks", href: "/admin/fleet" },
  {
    key: "expiringTruckDocs",
    label: "Truck registration/insurance due ≤30 days",
    href: "/admin/fleet",
    warn: true,
  },
  { key: "openDispatch", label: "Open dispatch jobs", href: "/admin/dispatch" },
  {
    key: "dispatchNext7",
    label: "Dispatch jobs next 7 days",
    href: "/admin/dispatch?tab=calendar",
  },
  { key: "openProjects", label: "Open projects", href: "/admin/projects" },
  { key: "openLeads", label: "Open leads", href: "/admin/crm" },
  { key: "newQuoteRequests", label: "New quote requests", href: "/admin/quotes" },
  {
    key: "estimatesAwaiting",
    label: "Estimates awaiting response",
    href: "/admin/quotes?tab=estimates",
  },
  { key: "upcomingAppointments", label: "Upcoming consultations", href: "/admin/appointments" },
  {
    key: "expiringDocuments",
    label: "Documents expiring ≤30 days",
    href: "/admin/documents",
    warn: true,
  },
  {
    key: "openPrivacyRequests",
    label: "Open privacy requests",
    href: "/admin/compliance",
    warn: true,
  },
];

function Overview() {
  const s = useAdminSession();
  const { tab } = Route.useSearch();
  const q = useRpc<{
    cards: Record<string, number>;
    myTasks: any[];
    upcomingDispatch: any[];
    recentLeads: any[];
  }>("dashboard.overview");
  return (
    <>
      <PageHeader
        title={`Welcome${s.fullName ? `, ${s.fullName.split(" ")[0]}` : ""}`}
        description="Live counts from AMCMS records. Empty values mean there is no data yet — nothing here is sample data."
      />
      <Tabs defaultValue={tab === "tasks" ? "tasks" : "overview"}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks & follow-ups</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4 space-y-6">
          {q.isLoading ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {CARDS.filter((c) => c.key in q.data!.cards).map((c) => (
                  <StatCard
                    key={c.key}
                    label={c.label}
                    value={q.data!.cards[c.key]}
                    href={c.href}
                    tone={c.warn && q.data!.cards[c.key] > 0 ? "warn" : "default"}
                  />
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="My open tasks">
                  {q.data!.myTasks.length ? (
                    <ul className="space-y-2 text-sm">
                      {q.data!.myTasks.map((t) => (
                        <li key={t.id} className="flex justify-between gap-2">
                          <span className="truncate">{t.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t.due_at ? fmtDateTime(t.due_at) : "No due date"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="No open tasks" />
                  )}
                </Panel>
                {s.permissions.includes("dispatch.read") && (
                  <Panel title="Upcoming dispatch">
                    {q.data!.upcomingDispatch.length ? (
                      <ul className="space-y-2 text-sm">
                        {q.data!.upcomingDispatch.map((j) => (
                          <li key={j.id}>
                            <Link
                              to="/admin/dispatch"
                              search={{ id: j.id }}
                              className="flex justify-between gap-2 hover:underline"
                            >
                              <span className="truncate">
                                {j.dispatch_number} · {j.pickup_location}
                              </span>
                              <StatusBadge value={j.status} />
                            </Link>
                            <span className="text-xs text-muted-foreground">
                              {fmtDateTime(j.scheduled_start)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState title="Nothing scheduled" />
                    )}
                  </Panel>
                )}
                {s.permissions.includes("crm.read") && (
                  <Panel title="Recent leads">
                    {q.data!.recentLeads.length ? (
                      <ul className="space-y-2 text-sm">
                        {q.data!.recentLeads.map((l) => (
                          <li key={l.id}>
                            <Link
                              to="/admin/crm"
                              search={{ lead: l.id }}
                              className="flex justify-between gap-2 hover:underline"
                            >
                              <span className="truncate">
                                {l.name}
                                {l.company ? ` · ${l.company}` : ""}
                              </span>
                              <StatusBadge value={l.stage} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState
                        title="No leads yet"
                        body="Website contact, quote and booking forms create leads automatically."
                      />
                    )}
                  </Panel>
                )}
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <ResourceManager
            resource="follow_up_tasks"
            emptyHint="Create tasks to track follow-ups with leads, customers or projects."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
