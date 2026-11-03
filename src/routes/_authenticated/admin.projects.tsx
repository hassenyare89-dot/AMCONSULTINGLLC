import { useState } from "react";
import { stringParams } from "@/lib/shared/search";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ConfirmButton,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/components/admin/kit";
import { RefSelect } from "@/components/admin/RefSelect";
import { ResourceManager } from "@/components/admin/ResourceManager";
import { DocumentsPanel } from "@/components/admin/DocumentsPanel";
import {
  DISPATCH_STATUS_OPTIONS,
  PROJECT_STATUS,
  SERVICE_TYPES,
  labelFor,
} from "@/lib/shared/domain";
import { formatMoney } from "@/lib/shared/quote-math";
import { fmtDate, fmtDateTime, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";

export const Route = createFileRoute("/_authenticated/admin/projects")({
  validateSearch: stringParams("id"),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <>
      <PageHeader
        title="Load & Project Management"
        description="Construction hauling projects linked to customers, dispatch jobs, drivers, trucks, and documents."
      />
      <ResourceManager
        resource="projects"
        openId={id}
        onOpenChange={(x) => navigate({ search: { id: x ?? undefined } })}
        detail={(row, labels) => <ProjectPanels project={row} labels={labels} />}
      />
    </>
  );
}

function ProjectPanels({
  project,
  labels,
}: {
  project: Record<string, any>;
  labels: Record<string, string>;
}) {
  const can = useCan();
  const q = useRpc<{
    jobs: any[];
    resources: any[];
    estimate: any;
    labels: Record<string, string>;
    progress: { total: number; done: number; pct: number };
  }>("projects.detail", { id: project.id });
  const [type, setType] = useState<"staff" | "driver" | "truck">("driver");
  const [rid, setRid] = useState<string | null>(null);
  const add = useRpcMutation("projects.addResource", {
    invalidate: ["projects."],
    success: "Assigned",
    onSuccess: () => setRid(null),
  });
  const remove = useRpcMutation("projects.removeResource", {
    invalidate: ["projects."],
    success: "Removed",
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  const d = q.data!;
  return (
    <>
      <Panel
        title="Progress"
        actions={
          <Button size="sm" variant="outline" onClick={() => printReport(project, labels, d)}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden />
            Project report
          </Button>
        }
      >
        <div className="flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={d.progress.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Dispatch jobs completed"
          >
            <div className="h-full bg-brand-green" style={{ width: `${d.progress.pct}%` }} />
          </div>
          <span className="text-sm tabular-nums">
            {d.progress.done}/{d.progress.total} jobs complete
          </span>
        </div>
        {d.estimate && (
          <p className="mt-3 text-sm">
            From estimate{" "}
            <Link className="underline" to="/admin/quotes" search={{ estimate: d.estimate.id }}>
              {d.estimate.estimate_number}
            </Link>{" "}
            · {formatMoney(d.estimate.total)}
          </p>
        )}
      </Panel>
      <Panel
        title="Dispatch jobs"
        actions={
          can("dispatch.write") && (
            <Link to="/admin/dispatch" className="text-sm underline">
              Open dispatch
            </Link>
          )
        }
      >
        {!d.jobs.length ? (
          <p className="text-sm text-muted-foreground">
            No jobs linked. Create a dispatch job and choose this project.
          </p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {d.jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link
                  to="/admin/dispatch"
                  search={{ id: j.id }}
                  className="font-medium text-navy hover:underline"
                >
                  {j.dispatch_number}
                </Link>
                <span className="text-muted-foreground">{fmtDateTime(j.scheduled_start)}</span>
                <span>
                  {[d.labels[j.driver_id], d.labels[j.truck_id]].filter(Boolean).join(" · ") ||
                    "Unassigned"}
                </span>
                <StatusBadge value={j.status} label={labelFor(DISPATCH_STATUS_OPTIONS, j.status)} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Assigned personnel & equipment">
        <ul className="mb-3 divide-y divide-border text-sm">
          {d.resources.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>
                <span className="text-xs uppercase text-muted-foreground">{r.resource_type}</span>{" "}
                {d.labels[r.staff_id ?? r.driver_id ?? r.truck_id] ?? "—"}
                {r.role ? ` · ${r.role}` : ""}
              </span>
              {can("projects.write") && (
                <ConfirmButton
                  variant="ghost"
                  title="Remove from project?"
                  onConfirm={() => remove.mutateAsync({ id: r.id, projectId: project.id })}
                >
                  Remove
                </ConfirmButton>
              )}
            </li>
          ))}
          {!d.resources.length && <li className="py-2 text-muted-foreground">None assigned.</li>}
        </ul>
        {can("projects.write") && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Resource type"
              className="rounded-md border px-2 py-1.5 text-sm"
              value={type}
              onChange={(e) => {
                setType(e.target.value as any);
                setRid(null);
              }}
            >
              <option value="driver">Driver</option>
              <option value="truck">Truck</option>
              <option value="staff">Staff</option>
            </select>
            <div className="min-w-56 flex-1">
              <RefSelect
                target={type === "driver" ? "drivers" : type === "truck" ? "trucks" : "staff"}
                value={rid}
                onChange={setRid}
                ariaLabel="Resource"
              />
            </div>
            <Button
              size="sm"
              disabled={!rid || add.isPending}
              onClick={() => add.mutate({ projectId: project.id, type, resourceId: rid })}
            >
              Assign
            </Button>
          </div>
        )}
      </Panel>
      <DocumentsPanel entityType="project" entityId={project.id} />
    </>
  );
}

function printReport(
  p: Record<string, any>,
  labels: Record<string, string>,
  d: { jobs: any[]; progress: { done: number; total: number } },
) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  const esc = (s: unknown) =>
    String(s ?? "—").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
    );
  w.document
    .write(`<!doctype html><title>${esc(p.project_number)} report</title><style>body{font:14px system-ui;padding:32px;color:#1F2937}h1{color:#072A6C}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px;text-align:left}</style>
  <h1>${esc(p.name)} (${esc(p.project_number)})</h1><p>Client: ${esc(labels[p.customer_id])} · Status: ${esc(labelFor(PROJECT_STATUS, p.status))} · Service: ${esc(labelFor(SERVICE_TYPES, p.service_type))}</p>
  <p>Address: ${esc(p.address)} · Start ${esc(fmtDate(p.start_date))} · Est. completion ${esc(fmtDate(p.estimated_completion_date))}</p>
  <p>Progress: ${d.progress.done} of ${d.progress.total} dispatch jobs completed.</p>
  <table><thead><tr><th>Dispatch</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>${d.jobs.map((j) => `<tr><td>${esc(j.dispatch_number)}</td><td>${esc(fmtDateTime(j.scheduled_start))}</td><td>${esc(labelFor(DISPATCH_STATUS_OPTIONS, j.status))}</td></tr>`).join("")}</tbody></table>
  <p style="color:#6B7280;font-size:12px">Generated ${esc(new Date().toLocaleString())} from AMCMS.</p>`);
  w.document.close();
  w.focus();
  w.print();
}
