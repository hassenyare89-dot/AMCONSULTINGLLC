import { useEffect, useState } from "react";
import { stringParams } from "@/lib/shared/search";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  Timeline,
  inputCls,
} from "@/components/admin/kit";
import { RefSelect } from "@/components/admin/RefSelect";
import { ResourceManager } from "@/components/admin/ResourceManager";
import { ESTIMATE_STATUS_OPTIONS, PRICING_UNITS, labelFor } from "@/lib/shared/domain";
import { estimateTotals, formatMoney, lineTotal } from "@/lib/shared/quote-math";
import { fmtDate, fmtDateTime, rpc, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/quotes")({
  validateSearch: stringParams("tab", "estimate", "request", "newFor"),
  component: QuotesPage,
});

function QuotesPage() {
  const { tab, estimate, request, newFor } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [draftSeed, setDraftSeed] = useState<any | null>(null);
  const current = estimate || draftSeed || newFor ? "estimates" : (tab ?? "requests");

  useEffect(() => {
    if (!newFor) return;
    rpc("resource.get", { resource: "leads", id: newFor })
      .then((r: any) =>
        setDraftSeed({
          title: "",
          customer_name: r.row.name,
          customer_email: r.row.email ?? "",
          customer_company: r.row.company,
          lead_id: r.row.id,
          items: [],
        }),
      )
      .catch((e) => toast.error(e.message));
  }, [newFor]);

  async function fromRequest(id: string) {
    try {
      const r = await rpc<{ draft: any }>("quotes.draftFromRequest", { id });
      setDraftSeed(r.draft);
      navigate({ search: { tab: "estimates" } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const can = useCan();
  return (
    <>
      <PageHeader
        title="Quotes & Estimates"
        description="Review website quote requests, build itemized estimates from approved pricing, send them securely, and convert accepted work into projects. Estimates are never binding until confirmed in writing."
      />
      <Tabs
        value={current}
        onValueChange={(v) => {
          setDraftSeed(null);
          navigate({ search: { tab: v } });
        }}
      >
        <TabsList>
          <TabsTrigger value="requests">Quote requests</TabsTrigger>
          <TabsTrigger value="estimates">Estimates</TabsTrigger>
          <TabsTrigger value="pricing">Pricing rules</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-4">
          <ResourceManager
            resource="quote_requests"
            openId={request}
            onOpenChange={(x) => navigate({ search: { tab: "requests", request: x ?? undefined } })}
            emptyHint="Requests submitted at /quote appear here."
            detail={(row) => (
              <div className="flex flex-wrap gap-2">
                {can("quotes.write") && (
                  <Button onClick={() => fromRequest(row.id)}>Create estimate from request</Button>
                )}
                {row.lead_id && (
                  <Link
                    className="self-center text-sm underline"
                    to="/admin/crm"
                    search={{ lead: row.lead_id }}
                  >
                    Open lead
                  </Link>
                )}
              </div>
            )}
          />
        </TabsContent>
        <TabsContent value="estimates" className="mt-4">
          <Estimates
            openId={estimate}
            seed={draftSeed}
            onClose={() => {
              setDraftSeed(null);
              navigate({ search: { tab: "estimates" } });
            }}
            onOpen={(x) => {
              setDraftSeed(null);
              navigate({ search: { tab: "estimates", estimate: x } });
            }}
            onNew={() =>
              setDraftSeed({ title: "", customer_name: "", customer_email: "", items: [] })
            }
          />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Only active rules can be applied to estimates. Rules require the pricing.manage
            permission (Admin) to change.
          </p>
          <ResourceManager
            resource="pricing_rules"
            emptyHint="Add your approved rates. AMCMS never invents prices."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Estimates({
  openId,
  seed,
  onOpen,
  onClose,
  onNew,
}: {
  openId?: string;
  seed: any | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  onNew: () => void;
}) {
  const can = useCan();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const q = useRpc<{ rows: any[]; total: number }>("quotes.list", { status, search });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="Search estimates"
          placeholder="Search estimates…"
          className={cn(inputCls, "max-w-xs")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter by status"
          className={cn(inputCls, "w-auto")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {ESTIMATE_STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {can("quotes.write") && (
          <Button size="sm" className="ml-auto bg-navy text-white hover:bg-navy/90" onClick={onNew}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            New estimate
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        {q.isLoading ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data!.rows.length ? (
          <EmptyState title="No estimates yet" />
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Estimates</caption>
            <thead className="bg-secondary/60 text-left">
              <tr>
                {["Estimate", "Customer", "Title", "Total", "Status", "Created"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-semibold text-navy">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data!.rows.map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium text-navy hover:underline focus-visible:focus-brand rounded"
                      onClick={() => onOpen(e.id)}
                    >
                      {e.estimate_number}
                      {e.revision > 1 ? ` r${e.revision}` : ""}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {e.customer_name}
                    {e.customer_company ? ` · ${e.customer_company}` : ""}
                  </td>
                  <td className="px-3 py-2">{e.title}</td>
                  <td className="px-3 py-2 tabular-nums">{formatMoney(e.total)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      value={e.status}
                      label={labelFor(ESTIMATE_STATUS_OPTIONS, e.status)}
                    />
                    {e.approved_at && (
                      <span className="ml-1 text-xs text-emerald-700">approved</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Sheet open={Boolean(openId || seed)} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
          {seed ? (
            <EstimateEditor seed={seed} onSaved={(id) => onOpen(id)} />
          ) : openId ? (
            <EstimateView id={openId} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type Item = {
  description: string;
  quantity: string | number;
  unit: string;
  unit_price: string | number;
  pricing_rule_id?: string | null;
};

function EstimateEditor({
  seed,
  id,
  onSaved,
}: {
  seed: any;
  id?: string;
  onSaved: (id: string) => void;
}) {
  const [f, setF] = useState<any>({
    tax_rate: 0,
    ...seed,
    customer_company: seed.customer_company ?? "",
    valid_until: seed.valid_until ?? "",
    terms: seed.terms ?? "",
    notes: seed.notes ?? "",
  });
  const [items, setItems] = useState<Item[]>(
    seed.items?.length
      ? seed.items
      : [{ description: "", quantity: 1, unit: "hour", unit_price: 0 }],
  );
  const rules = useRpc<{ rows: any[] }>("resource.list", {
    resource: "pricing_rules",
    page: 1,
    pageSize: 200,
    search: "",
    filters: { active: "true" },
  });
  const save = useRpcMutation<{ id: string }>("quotes.save", {
    invalidate: ["quotes.", "resource."],
    success: "Draft saved",
    onSuccess: (r) => onSaved(r.id),
  });
  const numeric = items.map((i) => ({
    quantity: Number(i.quantity) || 0,
    unit_price: Number(i.unit_price) || 0,
  }));
  const valid = numeric.every((i) => i.quantity > 0);
  const totals = valid ? estimateTotals(numeric, Number(f.tax_rate) || 0) : null;
  const setItem = (i: number, patch: Partial<Item>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const applyRule = (i: number, ruleId: string) => {
    const r = rules.data?.rows.find((x) => x.id === ruleId);
    if (r)
      setItem(i, {
        pricing_rule_id: r.id,
        description: items[i].description || r.name,
        unit: r.unit,
        unit_price: r.unit_price,
        quantity: Math.max(Number(items[i].quantity) || 1, Number(r.minimum_quantity) || 0) || 1,
      });
  };
  const field = (k: string, label: string, props: any = {}) => (
    <div>
      <Label htmlFor={`est-${k}`}>{label}</Label>
      <input
        id={`est-${k}`}
        className={cn(inputCls, "mt-1")}
        value={f[k] ?? ""}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        {...props}
      />
    </div>
  );
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          ...f,
          id,
          tax_rate: Number(f.tax_rate) || 0,
          valid_until: f.valid_until || null,
          customer_company: f.customer_company || null,
          items: items.map((i) => ({
            ...i,
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price),
          })),
        });
      }}
    >
      <SheetHeader>
        <SheetTitle>{id ? "Edit draft estimate" : "New estimate"}</SheetTitle>
        <SheetDescription>Totals are recalculated on the server when saved.</SheetDescription>
      </SheetHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {field("title", "Title *", { required: true, maxLength: 200 })}
        </div>
        {field("customer_name", "Customer name *", { required: true, maxLength: 150 })}
        {field("customer_email", "Customer email *", { required: true, type: "email" })}
        {field("customer_company", "Company")}
        <div>
          <Label htmlFor="est-cust">Linked customer (optional)</Label>
          <div className="mt-1">
            <RefSelect
              id="est-cust"
              target="customers"
              value={f.customer_id ?? null}
              onChange={(v) => setF({ ...f, customer_id: v })}
            />
          </div>
        </div>
        {field("valid_until", "Valid until", { type: "date" })}
        {field("tax_rate", "Tax rate (decimal, e.g. 0.07)", {
          type: "number",
          step: "0.0001",
          min: 0,
          max: 0.5,
        })}
      </div>
      <Panel title="Line items">
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-12">
              <div className="sm:col-span-12">
                <label className="sr-only" htmlFor={`rule-${i}`}>
                  Pricing rule
                </label>
                <select
                  id={`rule-${i}`}
                  className={cn(inputCls, "text-xs")}
                  value={it.pricing_rule_id ?? ""}
                  onChange={(e) =>
                    e.target.value
                      ? applyRule(i, e.target.value)
                      : setItem(i, { pricing_rule_id: null })
                  }
                >
                  <option value="">Custom line (no pricing rule)</option>
                  {(rules.data?.rows ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {formatMoney(r.unit_price)}{" "}
                      {labelFor(PRICING_UNITS, r.unit).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-5">
                <label className="sr-only" htmlFor={`d-${i}`}>
                  Description
                </label>
                <input
                  id={`d-${i}`}
                  placeholder="Description"
                  className={inputCls}
                  value={it.description}
                  maxLength={300}
                  required
                  onChange={(e) => setItem(i, { description: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="sr-only" htmlFor={`q-${i}`}>
                  Quantity
                </label>
                <input
                  id={`q-${i}`}
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Qty"
                  className={inputCls}
                  value={it.quantity}
                  onChange={(e) => setItem(i, { quantity: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="sr-only" htmlFor={`u-${i}`}>
                  Unit
                </label>
                <select
                  id={`u-${i}`}
                  className={inputCls}
                  value={it.unit}
                  onChange={(e) => setItem(i, { unit: e.target.value })}
                >
                  {PRICING_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.value.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="sr-only" htmlFor={`p-${i}`}>
                  Unit price
                </label>
                <input
                  id={`p-${i}`}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Price"
                  className={inputCls}
                  value={it.unit_price}
                  onChange={(e) => setItem(i, { unit_price: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-1 sm:col-span-1">
                <span className="text-xs tabular-nums">
                  {formatMoney(
                    lineTotal({
                      quantity: Number(it.quantity) || 0,
                      unit_price: Number(it.unit_price) || 0,
                    }),
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:focus-brand"
                  onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setItems((xs) => [
                ...xs,
                { description: "", quantity: 1, unit: "hour", unit_price: 0 },
              ])
            }
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Add line
          </Button>
        </div>
        {totals && (
          <dl className="mt-4 ml-auto w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax</dt>
              <dd className="tabular-nums">{formatMoney(totals.tax_amount)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold text-navy">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(totals.total)}</dd>
            </div>
          </dl>
        )}
      </Panel>
      <div>
        <Label htmlFor="est-terms">Terms shown to customer</Label>
        <textarea
          id="est-terms"
          className={cn(inputCls, "mt-1 min-h-20")}
          value={f.terms}
          maxLength={4000}
          onChange={(e) => setF({ ...f, terms: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="est-notes">Internal notes</Label>
        <textarea
          id="est-notes"
          className={cn(inputCls, "mt-1 min-h-16")}
          value={f.notes}
          maxLength={4000}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={save.isPending || !items.length}
          className="bg-navy text-white hover:bg-navy/90"
        >
          Save draft
        </Button>
      </div>
    </form>
  );
}

function EstimateView({ id }: { id: string }) {
  const can = useCan();
  const navigate = useNavigate();
  const q = useRpc<{ estimate: any; items: any[]; history: any[] }>("quotes.get", { id });
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);
  const inv = ["quotes.", "dashboard.", "resource."];
  const send = useRpcMutation<{ emailStatus: string; link?: string }>("quotes.send", {
    invalidate: inv,
    success: (r) =>
      r.emailStatus === "sent"
        ? "Estimate emailed to customer"
        : "Estimate marked sent — email not delivered",
    onSuccess: (r) => setFallbackLink(r.link ?? null),
  });
  const revise = useRpcMutation("quotes.revise", {
    invalidate: inv,
    success: "Revision opened as draft",
  });
  const approve = useRpcMutation("quotes.approve", { invalidate: inv, success: "Approved" });
  const convert = useRpcMutation<{ projectId: string }>("quotes.convert", {
    invalidate: inv,
    success: "Project created",
    onSuccess: (r) => navigate({ to: "/admin/projects", search: { id: r.projectId } }),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  const { estimate: e, items, history } = q.data!;
  if (editing && e.status === "draft")
    return <EstimateEditor id={id} seed={{ ...e, items }} onSaved={() => setEditing(false)} />;
  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle>
          {e.estimate_number}
          {e.revision > 1 ? ` (revision ${e.revision})` : ""} · {e.title}
        </SheetTitle>
        <SheetDescription>
          <StatusBadge value={e.status} label={labelFor(ESTIMATE_STATUS_OPTIONS, e.status)} />{" "}
          {e.approved_at && "· internally approved"} · Valid until {fmtDate(e.valid_until)}
        </SheetDescription>
      </SheetHeader>
      <Panel>
        <p className="text-sm">
          <strong>{e.customer_name}</strong>
          {e.customer_company ? ` · ${e.customer_company}` : ""} · {e.customer_email}
        </p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col">Description</th>
              <th scope="col">Qty</th>
              <th scope="col">Unit</th>
              <th scope="col">Price</th>
              <th scope="col" className="text-right">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="py-1.5">{i.description}</td>
                <td>{i.quantity}</td>
                <td>{i.unit}</td>
                <td>{formatMoney(i.unit_price)}</td>
                <td className="text-right tabular-nums">{formatMoney(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-3 w-60 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatMoney(e.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax ({(Number(e.tax_rate) * 100).toFixed(2)}%)</dt>
            <dd>{formatMoney(e.tax_amount)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold text-navy">
            <dt>Total</dt>
            <dd>{formatMoney(e.total)}</dd>
          </div>
        </dl>
        {e.customer_response_note && (
          <p className="mt-3 rounded bg-secondary/60 p-2 text-sm">
            Customer response: {e.customer_response_note}
          </p>
        )}
      </Panel>
      <Panel title="Actions">
        <div className="flex flex-wrap gap-2">
          {e.status === "draft" && can("quotes.write") && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit draft
            </Button>
          )}
          {["draft", "sent", "viewed"].includes(e.status) && can("quotes.send") && (
            <div className="w-full space-y-2">
              <Label htmlFor="send-msg">Message to customer (optional)</Label>
              <textarea
                id="send-msg"
                className={cn(inputCls, "min-h-16")}
                maxLength={2000}
                value={message}
                onChange={(ev) => setMessage(ev.target.value)}
              />
              <ConfirmButton
                variant="default"
                title={`Send ${e.estimate_number} to ${e.customer_email}?`}
                description="The customer receives a private link to view and respond. This does not create a binding commitment."
                confirmLabel="Send"
                onConfirm={() => send.mutateAsync({ id, message })}
              >
                {e.status === "draft" ? "Send to customer" : "Resend"}
              </ConfirmButton>
            </div>
          )}
          {!["draft"].includes(e.status) && !e.project_id && can("quotes.write") && (
            <Button variant="outline" onClick={() => revise.mutate({ id })}>
              Create revision
            </Button>
          )}
          {e.status === "accepted" && !e.approved_at && can("quotes.approve") && (
            <ConfirmButton
              variant="default"
              title="Approve this accepted estimate?"
              description="Confirms internally that the accepted scope and pricing are approved."
              onConfirm={() => approve.mutateAsync({ id })}
            >
              Approve
            </ConfirmButton>
          )}
          {e.status === "accepted" &&
            e.approved_at &&
            !e.project_id &&
            can("quotes.approve") &&
            can("projects.write") && (
              <Button onClick={() => convert.mutate({ id })}>Convert to project</Button>
            )}
          {e.project_id && (
            <Link
              className="self-center text-sm underline"
              to="/admin/projects"
              search={{ id: e.project_id }}
            >
              Open project
            </Link>
          )}
        </div>
        {fallbackLink && (
          <p className="mt-3 break-all rounded border border-amber-300 bg-amber-50 p-2 text-xs">
            Email delivery isn't configured or failed. Share this private link with the customer
            securely: <code>{fallbackLink}</code>
          </p>
        )}
      </Panel>
      <Panel title="Status history">
        <Timeline
          items={history.map((h) => ({
            id: h.id,
            title: `${h.from_status ? `${h.from_status} → ` : ""}${h.to_status}`,
            meta: `${fmtDateTime(h.created_at)} · ${h.actor_type}`,
            body: h.note,
          }))}
        />
      </Panel>
    </div>
  );
}
