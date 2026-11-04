import { useState } from "react";
import { stringParams } from "@/lib/shared/search";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  EmptyState,
  ErrorState,
  KeyValues,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  inputCls,
} from "@/components/admin/kit";
import { RefSelect } from "@/components/admin/RefSelect";
import { APPOINTMENT_STATUS, APPOINTMENT_TOPICS, labelFor } from "@/lib/shared/domain";
import { toLocalInput, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/appointments")({
  validateSearch: stringParams("id"),
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  });
  const [status, setStatus] = useState("");
  const end = new Date(weekStart.getTime() + 28 * 86400000);
  const q = useRpc<{ appointments: any[]; timezone: string; staff: Record<string, string> }>(
    "appointments.list",
    { from: weekStart.toISOString(), to: end.toISOString(), status: status || undefined },
  );
  const tz = q.data?.timezone ?? "America/New_York";
  const fmt = (v: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(v));
  const selected = q.data?.appointments.find((a) => a.id === id);
  return (
    <>
      <PageHeader
        title="Appointments & Scheduling"
        description={`Consultation requests from /book. Times shown in ${tz}. Overlapping bookings are blocked by the database.`}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-label="Previous weeks"
          onClick={() => setWeekStart(new Date(weekStart.getTime() - 28 * 86400000))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <span className="text-sm font-medium" aria-live="polite">
          {weekStart.toLocaleDateString()} – {end.toLocaleDateString()}
        </span>
        <Button
          size="sm"
          variant="outline"
          aria-label="Next weeks"
          onClick={() => setWeekStart(end)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <select
          aria-label="Filter by status"
          className={cn(inputCls, "w-auto")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {APPOINTMENT_STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        {q.isLoading ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data!.appointments.length ? (
          <EmptyState title="No consultations in this period" />
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Appointments</caption>
            <thead className="bg-secondary/60 text-left">
              <tr>
                {["When", "Name", "Topic", "Staff", "Status"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-navy">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data!.appointments.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="whitespace-nowrap px-3 py-2">
                    <button
                      type="button"
                      className="font-medium text-navy hover:underline focus-visible:focus-brand rounded"
                      onClick={() => navigate({ search: { id: a.id } })}
                    >
                      {fmt(a.starts_at)}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {a.name}
                    {a.company ? ` · ${a.company}` : ""}
                  </td>
                  <td className="px-3 py-2">{labelFor(APPOINTMENT_TOPICS, a.topic)}</td>
                  <td className="px-3 py-2">{q.data!.staff[a.staff_id] ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge value={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && navigate({ search: {} })}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected && <AppointmentDetail a={selected} fmt={fmt} staff={q.data!.staff} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function AppointmentDetail({
  a,
  fmt,
  staff,
}: {
  a: any;
  fmt: (v: string) => string;
  staff: Record<string, string>;
}) {
  const can = useCan();
  const [start, setStart] = useState(toLocalInput(a.starts_at));
  const [notify, setNotify] = useState(true);
  const upd = useRpcMutation("appointments.update", {
    invalidate: ["appointments.", "dashboard."],
    success: (r: any) => (r.emailStatus === "sent" ? "Updated — customer emailed" : "Updated"),
  });
  const act = (status: string) => upd.mutate({ id: a.id, status, notifyCustomer: notify });
  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle>{a.name}</SheetTitle>
        <SheetDescription>
          {fmt(a.starts_at)} · <StatusBadge value={a.status} />
        </SheetDescription>
      </SheetHeader>
      <KeyValues
        items={[
          [
            "Email",
            <a className="underline" href={`mailto:${a.email}`}>
              {a.email}
            </a>,
          ],
          ["Phone", a.phone],
          ["Company", a.company],
          ["Topic", labelFor(APPOINTMENT_TOPICS, a.topic)],
          ["Assigned staff", staff[a.staff_id] ?? "—"],
          ["Notes", a.notes],
        ]}
      />
      {a.lead_id && (
        <Link className="text-sm underline" to="/admin/crm" search={{ lead: a.lead_id }}>
          Open lead
        </Link>
      )}
      {can("appointments.write") && (
        <Panel title="Manage">
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />{" "}
              Email the customer about changes
            </label>
            <div className="flex flex-wrap gap-2">
              {a.status === "requested" && (
                <Button size="sm" onClick={() => act("confirmed")}>
                  Confirm
                </Button>
              )}
              {["requested", "confirmed"].includes(a.status) && (
                <Button size="sm" variant="outline" onClick={() => act("cancelled")}>
                  Cancel
                </Button>
              )}
              {a.status === "confirmed" && (
                <Button size="sm" variant="outline" onClick={() => act("completed")}>
                  Mark completed
                </Button>
              )}
              {a.status === "confirmed" && (
                <Button size="sm" variant="outline" onClick={() => act("no_show")}>
                  No-show
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="resched">Reschedule to</Label>
                <input
                  id="resched"
                  type="datetime-local"
                  className={cn(inputCls, "mt-1")}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!start}
                onClick={() =>
                  upd.mutate({
                    id: a.id,
                    startsAt: new Date(start).toISOString(),
                    notifyCustomer: notify,
                  })
                }
              >
                Reschedule
              </Button>
            </div>
            <div>
              <Label htmlFor="appt-staff">Assigned staff</Label>
              <div className="mt-1">
                <RefSelect
                  id="appt-staff"
                  target="staff"
                  value={a.staff_id}
                  initialLabel={staff[a.staff_id]}
                  onChange={(v) => upd.mutate({ id: a.id, staffId: v, notifyCustomer: false })}
                />
              </div>
            </div>
            {upd.error && (
              <p role="alert" className="text-sm text-destructive">
                {upd.error.message}
              </p>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
