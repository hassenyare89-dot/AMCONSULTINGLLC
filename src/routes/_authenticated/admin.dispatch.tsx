import { useMemo, useState } from "react";
import { stringParams } from "@/lib/shared/search";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  Timeline,
  EmptyState,
} from "@/components/admin/kit";
import { RefSelect } from "@/components/admin/RefSelect";
import { ResourceManager } from "@/components/admin/ResourceManager";
import {
  DISPATCH_STATUS_OPTIONS,
  DISPATCH_TRANSITIONS,
  labelFor,
  type DispatchStatus,
} from "@/lib/shared/domain";
import { fmtDateTime, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useAdminSession, useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/dispatch")({
  validateSearch: stringParams("id", "tab"),
  component: DispatchPage,
});

function DispatchPage() {
  const { id, tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const open = (x: string | null) => navigate({ search: { id: x ?? undefined, tab: "jobs" } });
  return (
    <>
      <PageHeader
        title="Dispatch Operations"
        description="Create and assign jobs, track status (New → Scheduled → Assigned → In Progress → Completed), and avoid double-booking. Locations are as entered — no live GPS tracking is connected."
      />
      <Tabs value={tab ?? "jobs"} onValueChange={(v) => navigate({ search: { tab: v } })}>
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="workload">Workload</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs" className="mt-4">
          <ResourceManager
            resource="dispatch_jobs"
            openId={id}
            onOpenChange={open}
            createLabel="New dispatch job"
            detail={(row) => <JobPanels job={row} />}
          />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <DispatchCalendar onOpen={open} />
        </TabsContent>
        <TabsContent value="workload" className="mt-4">
          <Workload />
        </TabsContent>
      </Tabs>
    </>
  );
}

function JobPanels({ job }: { job: Record<string, any> }) {
  const can = useCan();
  const s = useAdminSession();
  const d = useRpc<{
    history: any[];
    communications: any[];
    loads: any[];
    staff: Record<string, string>;
    canManageAll: boolean;
  }>("dispatch.detail", { id: job.id });
  const update = useRpcMutation("resource.update", {
    invalidate: ["resource.", "dispatch.", "dashboard."],
    success: "Status updated",
  });
  const editable =
    can("dispatch.write") &&
    (d.data?.canManageAll || !job.dispatcher_id || job.dispatcher_id === s.userId);
  const next = DISPATCH_TRANSITIONS[job.status as DispatchStatus] ?? [];
  return (
    <>
      {editable && next.length > 0 && (
        <Panel title="Move job">
          <div className="flex flex-wrap gap-2">
            {next.map((st) => (
              <Button
                key={st}
                size="sm"
                variant="outline"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({ resource: "dispatch_jobs", id: job.id, values: { status: st } })
                }
              >
                → {labelFor(DISPATCH_STATUS_OPTIONS, st)}
              </Button>
            ))}
          </div>
          {update.error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {update.error.message}
            </p>
          )}
        </Panel>
      )}
      {!editable && can("dispatch.write") && (
        <p className="text-sm text-muted-foreground">
          This job is assigned to another dispatcher; you have read-only access.
        </p>
      )}
      <Panel title="Communications log">
        <ResourceManager
          resource="dispatch_communications"
          fixedFilters={{ job_id: job.id }}
          compact
          createLabel="Log communication"
        />
      </Panel>
      <Panel title="Load / completion records">
        <ResourceManager
          resource="load_records"
          fixedFilters={{ job_id: job.id }}
          compact
          createLabel="Add load record"
        />
      </Panel>
      <Panel title="Status history">
        {d.isLoading ? (
          <LoadingState />
        ) : d.error ? (
          <ErrorState error={d.error} />
        ) : (
          <Timeline
            items={d.data!.history.map((h) => ({
              id: h.id,
              title: `${h.from_status ? `${labelFor(DISPATCH_STATUS_OPTIONS, h.from_status)} → ` : ""}${labelFor(DISPATCH_STATUS_OPTIONS, h.to_status)}`,
              meta: `${fmtDateTime(h.created_at)} · ${d.data!.staff[h.changed_by] ?? "Staff"}`,
              body: h.note,
            }))}
          />
        )}
      </Panel>
    </>
  );
}

type View = "day" | "week" | "month";
const startOf = (d: Date, view: View) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  if (view === "week") x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  if (view === "month") x.setDate(1);
  return x;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function DispatchCalendar({ onOpen }: { onOpen: (id: string) => void }) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [f, setF] = useState<{
    driverId?: string;
    truckId?: string;
    projectId?: string;
    dispatcherId?: string;
  }>({});
  const from = startOf(anchor, view);
  const to =
    view === "day"
      ? addDays(from, 1)
      : view === "week"
        ? addDays(from, 7)
        : new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const q = useRpc<{ jobs: any[]; labels: Record<string, string> }>("dispatch.calendar", {
    from: from.toISOString(),
    to: to.toISOString(),
    ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
  });
  const days = useMemo(() => {
    const list: Date[] = [];
    const gridStart = view === "month" ? startOf(from, "week") : from;
    const n = view === "day" ? 1 : view === "week" ? 7 : 42;
    for (let i = 0; i < n; i++) list.push(addDays(gridStart, i));
    return list;
  }, [from.getTime(), view]);
  const shift = (dir: 1 | -1) =>
    setAnchor((a) =>
      view === "day"
        ? addDays(a, dir)
        : view === "week"
          ? addDays(a, 7 * dir)
          : new Date(a.getFullYear(), a.getMonth() + dir, 1),
    );
  const jobsOn = (d: Date) =>
    (q.data?.jobs ?? []).filter(
      (j) => new Date(j.scheduled_start) < addDays(d, 1) && new Date(j.scheduled_end) > d,
    );
  const title =
    view === "month"
      ? from.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : view === "day"
        ? from.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : `Week of ${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => shift(-1)} aria-label="Previous">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>
          Today
        </Button>
        <Button size="sm" variant="outline" onClick={() => shift(1)} aria-label="Next">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <h2 className="mx-2 font-semibold text-navy" aria-live="polite">
          {title}
        </h2>
        <div className="ml-auto flex rounded-md border" role="group" aria-label="Calendar view">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              className={cn(
                "px-3 py-1.5 text-sm capitalize focus-visible:focus-brand",
                view === v && "bg-navy text-white",
              )}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <RefSelect
          target="drivers"
          value={f.driverId}
          onChange={(v) => setF({ ...f, driverId: v ?? undefined })}
          placeholder="All drivers"
          ariaLabel="Filter by driver"
        />
        <RefSelect
          target="trucks"
          value={f.truckId}
          onChange={(v) => setF({ ...f, truckId: v ?? undefined })}
          placeholder="All trucks"
          ariaLabel="Filter by truck"
        />
        <RefSelect
          target="projects"
          value={f.projectId}
          onChange={(v) => setF({ ...f, projectId: v ?? undefined })}
          placeholder="All projects"
          ariaLabel="Filter by project"
        />
        <RefSelect
          target="staff"
          value={f.dispatcherId}
          onChange={(v) => setF({ ...f, dispatcherId: v ?? undefined })}
          placeholder="All dispatchers"
          ariaLabel="Filter by dispatcher"
        />
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div
          className={cn(
            "grid gap-px overflow-hidden rounded-xl border border-border bg-border",
            view === "day" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-7",
          )}
        >
          {view !== "day" &&
            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div
                key={d}
                className="hidden bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground sm:block"
              >
                {d}
              </div>
            ))}
          {days.map((d) => {
            const jobs = jobsOn(d);
            const outside = view === "month" && d.getMonth() !== from.getMonth();
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  "min-h-28 bg-card p-1.5",
                  outside && "bg-secondary/40 text-muted-foreground",
                )}
              >
                <div className="mb-1 text-xs font-semibold">
                  {d.toLocaleDateString("en-US", {
                    weekday: view === "day" ? "long" : undefined,
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <ul className="space-y-1">
                  {jobs.map((j) => (
                    <li key={j.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(j.id)}
                        className="w-full rounded border-l-4 border-brand-green bg-secondary/70 px-1.5 py-1 text-left text-xs hover:bg-secondary focus-visible:focus-brand"
                      >
                        <span className="font-semibold">
                          {new Date(j.scheduled_start).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}{" "}
                          {j.dispatch_number}
                        </span>
                        <span className="block truncate">{j.pickup_location}</span>
                        <span className="block truncate text-muted-foreground">
                          {[q.data!.labels[j.driver_id], q.data!.labels[j.truck_id]]
                            .filter(Boolean)
                            .join(" · ") || "Unassigned"}
                        </span>
                        <StatusBadge
                          value={j.status}
                          label={labelFor(DISPATCH_STATUS_OPTIONS, j.status)}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Workload() {
  const [days, setDays] = useState(7);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = addDays(from, days);
  const q = useRpc<{ dispatchers: any[]; drivers: any[]; labels: Record<string, string> }>(
    "dispatch.workload",
    { from: from.toISOString(), to: to.toISOString() },
  );
  const table = (title: string, rows: any[], labels: Record<string, string>) => (
    <Panel title={title}>
      {!rows.length ? (
        <EmptyState title="No jobs in this period" />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-1">
                Name
              </th>
              <th scope="col">Jobs</th>
              <th scope="col">Open</th>
              <th scope="col">Scheduled hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id ?? "none"} className="border-t border-border">
                <td className="py-1.5">{r.id ? (labels[r.id] ?? "—") : <em>Unassigned</em>}</td>
                <td>{r.jobs}</td>
                <td>{r.open}</td>
                <td>{r.hours.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        Next
        <select
          className="rounded-md border px-2 py-1"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[1, 7, 14, 30].map((d) => (
            <option key={d} value={d}>
              {d} day{d > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </label>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {table("Dispatcher workload", q.data!.dispatchers, q.data!.labels)}
          {table("Driver workload", q.data!.drivers, q.data!.labels)}
        </div>
      )}
    </div>
  );
}
