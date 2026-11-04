import { useState } from "react";
import { stringParams } from "@/lib/shared/search";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ConfirmButton,
  EmptyState,
  ErrorState,
  KeyValues,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  Timeline,
  inputCls,
} from "@/components/admin/kit";
import { RefSelect } from "@/components/admin/RefSelect";
import { ResourceManager } from "@/components/admin/ResourceManager";
import { DocumentsPanel } from "@/components/admin/DocumentsPanel";
import {
  AVAILABILITY,
  DRIVER_APP_STATUS_OPTIONS,
  DRIVER_APP_TRANSITIONS,
  TRUCK_TYPES,
  PAYLOAD_UNITS,
  TRAVEL_RADIUS,
  MATERIALS,
  labelsFor,
  labelFor,
  type DriverAppStatus,
} from "@/lib/shared/domain";
import { downloadText, fmtDate, fmtDateTime, rpc, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/drivers")({
  validateSearch: stringParams("id", "tab"),
  component: DriversPage,
});

function DriversPage() {
  const { id, tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <>
      <PageHeader
        title="Driver Management"
        description="Review owner-operator registrations, record decisions, and manage approved drivers."
      />
      <Tabs
        value={tab === "roster" ? "roster" : "applications"}
        onValueChange={(v) => navigate({ search: { tab: v === "roster" ? "roster" : undefined } })}
      >
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="roster">Approved drivers</TabsTrigger>
        </TabsList>
        <TabsContent value="applications" className="mt-4">
          <Applications
            openId={tab !== "roster" ? id : undefined}
            onOpen={(x) => navigate({ search: { id: x ?? undefined } })}
          />
        </TabsContent>
        <TabsContent value="roster" className="mt-4">
          <ResourceManager
            resource="drivers"
            openId={tab === "roster" ? id : undefined}
            onOpenChange={(x) => navigate({ search: { tab: "roster", id: x ?? undefined } })}
            emptyHint="Approving an application creates a driver record automatically. You can also add drivers manually."
            detail={(row) => <DocumentsPanel entityType="driver" entityId={row.id} />}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

type App = Record<string, any>;

function Applications({
  openId,
  onOpen,
}: {
  openId?: string;
  onOpen: (id: string | null) => void;
}) {
  const can = useCan();
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    availability: "",
    truckType: "",
    serviceArea: "",
    reviewerId: "",
  });
  const [page, setPage] = useState(1);
  const q = useRpc<{ rows: App[]; total: number; byStatus: Record<string, number> }>(
    "drivers.applications",
    { ...filters, page, pageSize: 50 },
    { placeholderData: (p) => p },
  );
  const set = (k: keyof typeof filters, v: string) => {
    setFilters((s) => ({ ...s, [k]: v }));
    setPage(1);
  };
  async function exportCsv() {
    try {
      const r = await rpc<{ filename: string; csv: string }>("drivers.export", filters);
      downloadText(r.filename, r.csv);
    } catch (e) {
      (await import("sonner")).toast.error((e as Error).message);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {[{ value: "", label: "All active" }, ...DRIVER_APP_STATUS_OPTIONS].map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={filters.status === s.value}
            onClick={() => set("status", s.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium focus-visible:focus-brand",
              filters.status === s.value
                ? "border-navy bg-navy text-white"
                : "border-border bg-card hover:bg-secondary",
            )}
          >
            {s.label}
            {s.value && q.data?.byStatus[s.value] ? ` (${q.data.byStatus[s.value]})` : ""}
          </button>
        ))}
      </div>
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Label htmlFor="app-search">Search</Label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <input
              id="app-search"
              type="search"
              className={cn(inputCls, "pl-8")}
              placeholder="Name, email, phone, USDOT, MC"
              value={filters.search}
              onChange={(e) => set("search", e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="app-area">Location / service area</Label>
          <input
            id="app-area"
            className={cn(inputCls, "mt-1")}
            placeholder="County or city"
            value={filters.serviceArea}
            onChange={(e) => set("serviceArea", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="app-truck">Truck type</Label>
          <select
            id="app-truck"
            className={cn(inputCls, "mt-1")}
            value={filters.truckType}
            onChange={(e) => set("truckType", e.target.value)}
          >
            <option value="">All types</option>
            {TRUCK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="app-avail">Availability</Label>
          <select
            id="app-avail"
            className={cn(inputCls, "mt-1")}
            value={filters.availability}
            onChange={(e) => set("availability", e.target.value)}
          >
            <option value="">All</option>
            {AVAILABILITY.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="app-reviewer">Reviewer</Label>
          <div className="mt-1">
            <RefSelect
              id="app-reviewer"
              target="staff"
              value={filters.reviewerId || null}
              onChange={(v) => set("reviewerId", v ?? "")}
              placeholder="Anyone"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {q.data ? `${q.data.total} application${q.data.total === 1 ? "" : "s"}` : ""}
        </p>
        {can("drivers.export") && (
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden /> Export CSV
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        {q.isLoading ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.rows.length ? (
          <EmptyState
            title="No applications match"
            body="New registrations from the website appear here automatically."
          />
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Driver applications</caption>
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {[
                  "Received",
                  "Owner",
                  "Contact",
                  "USDOT / MC",
                  "Trucks",
                  "Location / area",
                  "Availability",
                  "Status",
                ].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data.rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top hover:bg-secondary/40">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {fmtDate(r.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-left font-medium text-navy hover:underline focus-visible:focus-brand rounded"
                      onClick={() => onOpen(r.id)}
                    >
                      {r.owner_name}
                    </button>
                    {r.company_name && (
                      <div className="text-xs text-muted-foreground">{r.company_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`mailto:${r.email}`} className="block hover:underline">
                      {r.email}
                    </a>
                    <a
                      href={`tel:${r.phone}`}
                      className="block text-xs text-muted-foreground hover:underline"
                    >
                      {r.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.dot_number || "—"}
                    {r.mc_number ? ` / ${r.mc_number}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    {r.truck_count} × {labelsFor(TRUCK_TYPES, r.truck_type)}
                    {r.payload_capacity && (
                      <div className="text-xs text-muted-foreground">
                        {r.payload_capacity} {labelFor(PAYLOAD_UNITS, r.payload_unit).toLowerCase()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.current_location && <div className="font-medium">{r.current_location}</div>}
                    <div className={r.current_location ? "text-xs text-muted-foreground" : ""}>
                      {r.service_area}
                    </div>
                  </td>
                  <td className="px-4 py-3">{labelsFor(AVAILABILITY, r.availability)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      value={r.status}
                      label={labelFor(DRIVER_APP_STATUS_OPTIONS, r.status)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {q.data && q.data.total > 50 && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 50 >= q.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <Sheet open={Boolean(openId)} onOpenChange={(o) => !o && onOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          {openId && <ApplicationDetail id={openId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ApplicationDetail({ id }: { id: string }) {
  const can = useCan();
  const q = useRpc<{
    application: App;
    history: any[];
    notes: any[];
    driver: any;
    documents: any[];
    staffNames: Record<string, string>;
  }>("drivers.application", { id });
  const [target, setTarget] = useState<DriverAppStatus | "">("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const [newNote, setNewNote] = useState("");
  const change = useRpcMutation("drivers.changeStatus", {
    invalidate: ["drivers.", "dashboard.", "resource."],
    success: (r: any) => (r.notified ? "Status updated — applicant emailed" : "Status updated"),
    onSuccess: () => {
      setTarget("");
      setNote("");
      setMessage("");
    },
  });
  const addNote = useRpcMutation("drivers.addNote", {
    invalidate: ["drivers.application"],
    success: "Note added",
    onSuccess: () => setNewNote(""),
  });
  const reviewer = useRpcMutation("drivers.assignReviewer", {
    invalidate: ["drivers."],
    success: "Reviewer updated",
  });

  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  const { application: a, history, notes, driver, staffNames } = q.data!;
  const allowed = DRIVER_APP_TRANSITIONS[(a.status as DriverAppStatus) ?? "new"] ?? [];
  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle>{a.owner_name}</SheetTitle>
        <SheetDescription>
          Received {fmtDateTime(a.created_at)} ·{" "}
          <StatusBadge value={a.status} label={labelFor(DRIVER_APP_STATUS_OPTIONS, a.status)} />
        </SheetDescription>
      </SheetHeader>
      <Panel title="Submitted information">
        <KeyValues
          items={[
            ["Company", a.company_name],
            [
              "Email",
              <a href={`mailto:${a.email}`} className="hover:underline">
                {a.email}
              </a>,
            ],
            [
              "Phone",
              <a href={`tel:${a.phone}`} className="hover:underline">
                {a.phone}
              </a>,
            ],
            ["USDOT", a.dot_number || "Not provided"],
            ["MC", a.mc_number || "Not provided"],
            ["Number of dump trucks", a.truck_count],
            ["Truck type", labelsFor(TRUCK_TYPES, a.truck_type)],
            [
              "Payload capacity",
              a.payload_capacity
                ? `${a.payload_capacity} ${labelFor(PAYLOAD_UNITS, a.payload_unit).toLowerCase()}`
                : "—",
            ],
            ["Current truck location", a.current_location || "—"],
            ["Service area (GA)", a.service_area],
            ["Availability", labelsFor(AVAILABILITY, a.availability)],
            ["Willing to travel", labelFor(TRAVEL_RADIUS, a.travel_radius)],
            ["CDL class", a.cdl_class ? `Class ${a.cdl_class}` : "—"],
            [
              "Insurance active",
              a.insurance_active == null ? "—" : a.insurance_active ? "Yes" : "No",
            ],
            ["Preferred material", labelsFor(MATERIALS, a.preferred_materials)],
            [
              "Georgia operating attestation",
              a.georgia_attested
                ? `Confirmed ${new Date(a.georgia_attested_at).toLocaleString()}`
                : "Not recorded (older form)",
            ],
            [
              "Privacy notice acknowledged",
              a.consent_privacy == null
                ? "Not recorded (pre-AMCMS)"
                : a.consent_privacy
                  ? "Yes"
                  : "No",
            ],
            [
              "Contact consent",
              a.consent_contact == null ? "Not recorded" : a.consent_contact ? "Yes" : "No",
            ],
          ]}
        />
        {a.notes && (
          <p className="mt-4 whitespace-pre-wrap rounded-md bg-secondary/60 p-3 text-sm">
            {a.notes}
          </p>
        )}
        {a.dot_number && (
          <p className="mt-3 text-xs text-muted-foreground">
            Verify authority and insurance independently, e.g. on the{" "}
            <a
              className="underline"
              href={`https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(a.dot_number)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              FMCSA SAFER snapshot
            </a>
            .
          </p>
        )}
      </Panel>
      {driver && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Approved driver record: {driver.full_name} ({driver.status}).
        </p>
      )}
      {can("drivers.review") && (
        <Panel title="Review">
          <div className="space-y-4">
            <div>
              <Label htmlFor="reviewer">Assigned reviewer</Label>
              <div className="mt-1 max-w-sm">
                <RefSelect
                  id="reviewer"
                  target="staff"
                  value={a.reviewer_id}
                  initialLabel={staffNames[a.reviewer_id]}
                  onChange={(v) => reviewer.mutate({ id, reviewerId: v })}
                  placeholder="Unassigned"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {allowed.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={target === s ? "default" : "outline"}
                  onClick={() => setTarget(s)}
                >
                  {
                    {
                      reviewed: "Mark under review",
                      info_requested: "Request info",
                      approved: "Approve",
                      rejected: "Reject",
                      archived: "Archive",
                      new: "Reopen",
                    }[s]
                  }
                </Button>
              ))}
            </div>
            {target && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                {(target === "info_requested" ||
                  target === "approved" ||
                  target === "rejected" ||
                  target === "reviewed") && (
                  <div>
                    <Label htmlFor="msg">
                      Message to applicant
                      {target === "info_requested" ? " (required)" : " (optional)"}
                    </Label>
                    <textarea
                      id="msg"
                      className={cn(inputCls, "mt-1 min-h-20")}
                      maxLength={2000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        target === "info_requested"
                          ? "e.g. Please send a current certificate of insurance and W-9."
                          : ""
                      }
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="note">Internal note (not shown to applicant)</Label>
                  <textarea
                    id="note"
                    className={cn(inputCls, "mt-1 min-h-16")}
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(e) => setNotify(e.target.checked)}
                  />{" "}
                  Email the applicant about this change
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={change.isPending}
                    className="bg-navy text-white hover:bg-navy/90"
                    onClick={() =>
                      change.mutate({
                        id,
                        status: target,
                        note,
                        applicantMessage: message,
                        notifyApplicant: notify,
                      })
                    }
                  >
                    Confirm: {labelFor(DRIVER_APP_STATUS_OPTIONS, target)}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTarget("")}>
                    Cancel
                  </Button>
                </div>
                {target === "approved" && (
                  <p className="text-xs text-muted-foreground">
                    Approval creates (or reactivates) a driver record that can be assigned to trucks
                    and dispatch jobs.
                  </p>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}
      <Panel title="Internal notes">
        {can("drivers.write") && (
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newNote.trim()) addNote.mutate({ id, body: newNote });
            }}
          >
            <label htmlFor="new-note" className="sr-only">
              New note
            </label>
            <input
              id="new-note"
              className={inputCls}
              placeholder="Add a note…"
              maxLength={4000}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={addNote.isPending}>
              Add
            </Button>
          </form>
        )}
        <Timeline
          items={notes.map((n) => ({
            id: n.id,
            title: staffNames[n.author_id] ?? "Staff",
            meta: fmtDateTime(n.created_at),
            body: n.body,
          }))}
        />
      </Panel>
      <Panel title="Status history">
        <Timeline
          items={history.map((h) => ({
            id: h.id,
            title: `${h.from_status ? `${labelFor(DRIVER_APP_STATUS_OPTIONS, h.from_status)} → ` : ""}${labelFor(DRIVER_APP_STATUS_OPTIONS, h.to_status)}`,
            meta: `${fmtDateTime(h.created_at)} · ${h.changed_by ? (staffNames[h.changed_by] ?? "Staff") : "Applicant / system"}`,
            body: h.note,
          }))}
        />
      </Panel>
      <DocumentsPanel entityType="driver_application" entityId={id} />
    </div>
  );
}
