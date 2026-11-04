import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
  inputCls,
} from "@/components/admin/kit";
import {
  DISPATCH_STATUS_OPTIONS,
  DRIVER_APP_STATUS_OPTIONS,
  LEAD_SOURCES,
  LEAD_STAGE_OPTIONS,
  PROJECT_STATUS,
  SERVICE_TYPES,
  TASK_STATUS,
  labelFor,
  type Option,
} from "@/lib/shared/domain";
import { formatMoney } from "@/lib/shared/quote-math";
import { downloadText, rpc, useRpc } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/reports")({ component: ReportsPage });

/** Accessible bar list: every value is printed, bars are decorative. */
function Bars({ data, options }: { data: Record<string, number>; options?: readonly Option[] }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length)
    return <p className="text-sm text-muted-foreground">No records in this period.</p>;
  return (
    <ul className="space-y-2">
      {entries.map(([k, v]) => (
        <li
          key={k}
          className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2 text-sm"
        >
          <span className="truncate">{options ? labelFor(options, k) : k}</span>
          <span className="h-3 rounded bg-secondary" aria-hidden>
            <span className="block h-3 rounded bg-navy" style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">{v}</span>
        </li>
      ))}
    </ul>
  );
}

function ReportsPage() {
  const can = useCan();
  const today = new Date().toISOString().slice(0, 10);
  const [range, setRange] = useState({
    from: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    to: today,
  });
  const q = useRpc<any>("reports.summary", range);
  async function exportCsv() {
    try {
      const r = await rpc<{ filename: string; csv: string }>("reports.export", range);
      downloadText(r.filename, r.csv);
    } catch (e) {
      (await import("sonner")).toast.error((e as Error).message);
    }
  }
  const r = q.data;
  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Computed live from AMCMS records for the selected period. No figures are estimated or sample data."
        actions={
          can("reports.export") && (
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="r-from">From</Label>
          <input
            id="r-from"
            type="date"
            className={cn(inputCls, "mt-1")}
            value={range.from}
            max={range.to}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="r-to">To</Label>
          <input
            id="r-to"
            type="date"
            className={cn(inputCls, "mt-1")}
            value={range.to}
            min={range.from}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </div>
        {[30, 90, 365].map((d) => (
          <Button
            key={d}
            size="sm"
            variant="ghost"
            onClick={() =>
              setRange({
                from: new Date(Date.now() - d * 86400000).toISOString().slice(0, 10),
                to: today,
              })
            }
          >
            Last {d} days
          </Button>
        ))}
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Driver registrations"
              value={r.driverRegistrations.total}
              hint={`${r.driverRegistrations.pendingNow} pending now`}
            />
            <StatCard label="Active truck records" value={r.trucks.activeNow} hint="current" />
            <StatCard label="Dispatch jobs scheduled" value={r.dispatch.total} />
            <StatCard
              label="Quote conversion"
              value={r.quotes.conversionRate == null ? "—" : `${r.quotes.conversionRate}%`}
              hint={`${r.quotes.accepted} accepted of ${r.quotes.sent} sent · ${formatMoney(r.quotes.acceptedValue)}`}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Driver registrations by status">
              <Bars data={r.driverRegistrations.byStatus} options={DRIVER_APP_STATUS_OPTIONS} />
            </Panel>
            <Panel title="Dispatch assignments by status">
              <Bars data={r.dispatch.byStatus} options={DISPATCH_STATUS_OPTIONS} />
            </Panel>
            <Panel title="Monthly website inquiries (contact form)">
              <Bars data={r.inquiries.contactMonthly} />
            </Panel>
            <Panel title="Monthly quote requests">
              <Bars data={r.inquiries.quoteRequestsMonthly} />
            </Panel>
            <Panel title="Quote requests by service">
              <Bars data={r.inquiries.quoteRequestsByService} options={SERVICE_TYPES} />
            </Panel>
            <Panel title="Leads by stage">
              <Bars data={r.leads.byStage} options={LEAD_STAGE_OPTIONS} />
            </Panel>
            <Panel title="Leads by source">
              <Bars data={r.leads.bySource} options={LEAD_SOURCES} />
            </Panel>
            <Panel title="Projects by status">
              <Bars data={r.projects.byStatus} options={PROJECT_STATUS} />
            </Panel>
            <Panel title="Administrative tasks by status">
              <Bars data={r.tasks.byStatus} options={TASK_STATUS} />
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
