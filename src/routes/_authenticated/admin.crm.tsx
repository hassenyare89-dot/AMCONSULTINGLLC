import { useState } from "react";
import { stringParams } from "@/lib/shared/search";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  Timeline,
} from "@/components/admin/kit";
import { RefSelect } from "@/components/admin/RefSelect";
import { ResourceManager } from "@/components/admin/ResourceManager";
import { DocumentsPanel } from "@/components/admin/DocumentsPanel";
import { LEAD_STAGE_OPTIONS, SERVICE_TYPES, labelFor } from "@/lib/shared/domain";
import { formatMoney } from "@/lib/shared/quote-math";
import { fmtDate, fmtDateTime, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";

export const Route = createFileRoute("/_authenticated/admin/crm")({
  validateSearch: stringParams("tab", "lead", "id"),
  component: CrmPage,
});

function CrmPage() {
  const { tab, lead, id } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const current = lead ? "leads" : (tab ?? "pipeline");
  return (
    <>
      <PageHeader
        title="Customer CRM"
        description="Leads from website forms land here automatically. Track the pipeline, interactions, follow-ups and customer accounts."
      />
      <Tabs value={current} onValueChange={(v) => navigate({ search: { tab: v } })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="tasks">Follow-ups</TabsTrigger>
          <TabsTrigger value="submissions">Website submissions</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline" className="mt-4">
          <Pipeline onOpen={(x) => navigate({ search: { lead: x } })} />
        </TabsContent>
        <TabsContent value="leads" className="mt-4">
          <ResourceManager
            resource="leads"
            openId={lead}
            onOpenChange={(x) => navigate({ search: { tab: "leads", lead: x ?? undefined } })}
            detail={(row) => <LeadPanels lead={row} />}
          />
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <ResourceManager
            resource="customers"
            openId={current === "customers" ? id : undefined}
            onOpenChange={(x) => navigate({ search: { tab: "customers", id: x ?? undefined } })}
            detail={(row) => <CustomerPanels customer={row} />}
          />
        </TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <ResourceManager resource="follow_up_tasks" />
        </TabsContent>
        <TabsContent value="submissions" className="mt-4">
          <ResourceManager
            resource="contact_submissions"
            detail={(row) =>
              row.lead_id ? (
                <Link className="text-sm underline" to="/admin/crm" search={{ lead: row.lead_id }}>
                  Open linked lead
                </Link>
              ) : null
            }
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Pipeline({ onOpen }: { onOpen: (id: string) => void }) {
  const can = useCan();
  const [owner, setOwner] = useState<string | null>(null);
  const q = useRpc<{ columns: Record<string, any[]>; owners: Record<string, string> }>(
    "crm.pipeline",
    owner ? { ownerId: owner } : {},
  );
  const move = useRpcMutation("resource.update", {
    invalidate: ["crm.", "resource.", "dashboard."],
    success: "Stage updated",
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <RefSelect
          target="staff"
          value={owner}
          onChange={setOwner}
          placeholder="All account owners"
          ariaLabel="Filter by owner"
        />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {LEAD_STAGE_OPTIONS.map((stage) => {
          const items = q.data!.columns[stage.value] ?? [];
          return (
            <section
              key={stage.value}
              aria-label={`${stage.label} (${items.length})`}
              className="w-64 shrink-0 rounded-xl border border-border bg-secondary/50 p-2"
            >
              <h3 className="mb-2 flex justify-between px-1 text-xs font-semibold uppercase tracking-wider text-navy">
                {stage.label}
                <span>{items.length}</span>
              </h3>
              <ul className="space-y-2">
                {items.map((l) => (
                  <li
                    key={l.id}
                    className="rounded-lg border border-border bg-card p-2 text-sm shadow-sm"
                  >
                    <button
                      type="button"
                      className="text-left font-medium text-navy hover:underline focus-visible:focus-brand rounded"
                      onClick={() => onOpen(l.id)}
                    >
                      {l.name}
                    </button>
                    <div className="text-xs text-muted-foreground">
                      {[
                        l.company,
                        labelFor(SERVICE_TYPES, l.service_interest) !== "—" &&
                          labelFor(SERVICE_TYPES, l.service_interest),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {l.next_follow_up_at && (
                      <div className="text-xs">Follow up {fmtDate(l.next_follow_up_at)}</div>
                    )}
                    {can("crm.write") && (
                      <select
                        aria-label={`Move ${l.name} to stage`}
                        className="mt-2 w-full rounded border px-1 py-0.5 text-xs"
                        value={l.stage}
                        onChange={(e) =>
                          move.mutate({
                            resource: "leads",
                            id: l.id,
                            values: { stage: e.target.value },
                          })
                        }
                      >
                        {LEAD_STAGE_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Activity({ leadId, customerId }: { leadId?: string; customerId?: string }) {
  const q = useRpc<any>("crm.detail", leadId ? { leadId } : { customerId });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  const d = q.data;
  return (
    <>
      {d.submissions?.length > 0 && (
        <Panel title="Website submissions">
          <ul className="space-y-2 text-sm">
            {d.submissions.map((s: any) => (
              <li key={s.id} className="whitespace-pre-wrap rounded bg-secondary/50 p-2">
                <span className="text-xs text-muted-foreground">{fmtDateTime(s.created_at)}</span>
                {"\n"}
                {s.message}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title="Interaction history">
        <ResourceManager
          resource="lead_activities"
          fixedFilters={leadId ? { lead_id: leadId } : { customer_id: customerId! }}
          compact
          createLabel="Log interaction"
        />
        <div className="mt-4">
          <Timeline
            items={d.activities
              .filter((a: any) => ["stage_change", "form_submission"].includes(a.type))
              .map((a: any) => ({
                id: a.id,
                title: a.type === "stage_change" ? "Stage change" : "Website form",
                meta: fmtDateTime(a.created_at),
                body: a.body,
              }))}
          />
        </div>
      </Panel>
      <Panel title="Follow-up tasks">
        <ResourceManager
          resource="follow_up_tasks"
          fixedFilters={leadId ? { lead_id: leadId } : { customer_id: customerId! }}
          compact
          createLabel="Add follow-up"
        />
      </Panel>
      {d.estimates?.length > 0 && (
        <Panel title="Estimates">
          <ul className="text-sm">
            {d.estimates.map((e: any) => (
              <li key={e.id} className="flex justify-between py-1">
                <Link className="underline" to="/admin/quotes" search={{ estimate: e.id }}>
                  {e.estimate_number} · {e.title}
                </Link>
                <span>
                  {formatMoney(e.total)} <StatusBadge value={e.status} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {d.projects?.length > 0 && (
        <Panel title="Projects">
          <ul className="text-sm">
            {d.projects.map((p: any) => (
              <li key={p.id} className="flex justify-between py-1">
                <Link className="underline" to="/admin/projects" search={{ id: p.id }}>
                  {p.project_number} · {p.name}
                </Link>
                <StatusBadge value={p.status} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function LeadPanels({ lead }: { lead: Record<string, any> }) {
  const can = useCan();
  const navigate = useNavigate();
  const convert = useRpcMutation<{ customerId: string }>("crm.convertLead", {
    invalidate: ["resource.", "crm."],
    success: "Converted to customer",
    onSuccess: (r) =>
      navigate({ to: "/admin/crm", search: { tab: "customers", id: r.customerId } }),
  });
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {can("crm.write") && !lead.customer_id && (
          <Button size="sm" onClick={() => convert.mutate({ leadId: lead.id })}>
            Convert to customer
          </Button>
        )}
        {lead.customer_id && (
          <Link
            className="text-sm underline"
            to="/admin/crm"
            search={{ tab: "customers", id: lead.customer_id }}
          >
            Open customer account
          </Link>
        )}
        {can("quotes.write") && (
          <Link
            className="text-sm underline"
            to="/admin/quotes"
            search={{ tab: "estimates", newFor: lead.id }}
          >
            Create estimate
          </Link>
        )}
        {lead.email && (
          <a className="text-sm underline" href={`mailto:${lead.email}`}>
            Email
          </a>
        )}
        {lead.phone && (
          <a className="text-sm underline" href={`tel:${lead.phone}`}>
            Call
          </a>
        )}
      </div>
      <Activity leadId={lead.id} />
    </>
  );
}

function CustomerPanels({ customer }: { customer: Record<string, any> }) {
  return (
    <>
      <Panel title="Contacts">
        <ResourceManager
          resource="customer_contacts"
          fixedFilters={{ customer_id: customer.id }}
          compact
          createLabel="Add contact"
        />
      </Panel>
      <Activity customerId={customer.id} />
      <DocumentsPanel entityType="customer" entityId={customer.id} />
    </>
  );
}
