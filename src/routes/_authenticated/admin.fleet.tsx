import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { stringParams } from "@/lib/shared/search";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel } from "@/components/admin/kit";
import { ResourceManager } from "@/components/admin/ResourceManager";
import { DocumentsPanel } from "@/components/admin/DocumentsPanel";
import { fmtDate, useRpc } from "@/lib/admin/rpc";

export const Route = createFileRoute("/_authenticated/admin/fleet")({
  validateSearch: stringParams("id", "tab"),
  component: FleetPage,
});

function FleetPage() {
  const { id, tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <>
      <PageHeader
        title="Truck & Fleet Management"
        description="Truck profiles, driver assignments, document expiry and maintenance reminders. Vehicle records are never shown publicly."
      />
      <Tabs
        value={tab ?? "trucks"}
        onValueChange={(v) => navigate({ search: { tab: v === "trucks" ? undefined : v } })}
      >
        <TabsList>
          <TabsTrigger value="trucks">Trucks</TabsTrigger>
          <TabsTrigger value="expiring">Expiry & maintenance</TabsTrigger>
          <TabsTrigger value="assignments">Assignment history</TabsTrigger>
        </TabsList>
        <TabsContent value="trucks" className="mt-4">
          <ResourceManager
            resource="trucks"
            openId={id}
            onOpenChange={(x) => navigate({ search: { id: x ?? undefined } })}
            emptyHint="Add trucks to assign them to drivers and dispatch jobs."
            detail={(row) => (
              <>
                <Panel title="Assignment history">
                  <ResourceManager
                    resource="truck_assignments"
                    fixedFilters={{ truck_id: row.id }}
                    compact
                  />
                </Panel>
                <DocumentsPanel entityType="truck" entityId={row.id} />
              </>
            )}
          />
        </TabsContent>
        <TabsContent value="expiring" className="mt-4">
          <Expiring onOpen={(x) => navigate({ search: { id: x } })} />
        </TabsContent>
        <TabsContent value="assignments" className="mt-4">
          <ResourceManager resource="truck_assignments" />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Expiring({ onOpen }: { onOpen: (id: string) => void }) {
  const horizon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const mk = (column: string) => ({
    resource: "trucks",
    page: 1,
    pageSize: 100,
    search: "",
    filters: {},
    sort: { column, ascending: true },
    dateRange: { column, to: horizon },
  });
  const reg = useRpc("resource.list", mk("registration_expires_on"));
  const ins = useRpc("resource.list", mk("insurance_expires_on"));
  const mnt = useRpc("resource.list", mk("next_maintenance_on"));
  const today = new Date().toISOString().slice(0, 10);
  const block = (title: string, q: any, col: string) => (
    <Panel title={title}>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data.rows.length ? (
        <EmptyState title="Nothing due in the next 60 days" />
      ) : (
        <ul className="divide-y divide-border text-sm">
          {q.data.rows.map((r: any) => (
            <li key={r.id} className="flex justify-between py-2">
              <button
                type="button"
                className="font-medium text-navy hover:underline focus-visible:focus-brand rounded"
                onClick={() => onOpen(r.id)}
              >
                {r.unit_number}
              </button>
              <span className={r[col] < today ? "font-semibold text-destructive" : ""}>
                {r[col] < today ? "Overdue · " : ""}
                {fmtDate(r[col])}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {block("Registration", reg, "registration_expires_on")}
      {block("Insurance", ins, "insurance_expires_on")}
      {block("Maintenance", mnt, "next_maintenance_on")}
      <p className="text-xs text-muted-foreground lg:col-span-3">
        The daily maintenance job also creates in-app reminders 30 days before each date (see
        docs/07-OPERATIONS.md).
      </p>
    </div>
  );
}
