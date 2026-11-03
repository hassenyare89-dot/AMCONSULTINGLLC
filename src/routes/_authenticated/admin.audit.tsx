import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  inputCls,
} from "@/components/admin/kit";
import { fmtDateTime, useRpc } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/audit")({ component: AuditPage });

function AuditPage() {
  const can = useCan();
  return (
    <>
      <PageHeader
        title="Security & Audit Logs"
        description="Append-only record of administrative actions (the database rejects edits and deletes), sign-in history, and email delivery."
      />
      <Tabs defaultValue="actions">
        <TabsList>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="logins">Sign-ins</TabsTrigger>
          {can("settings.read") && <TabsTrigger value="email">Email delivery</TabsTrigger>}
        </TabsList>
        <TabsContent value="actions" className="mt-4">
          <Actions />
        </TabsContent>
        <TabsContent value="logins" className="mt-4">
          <Logins />
        </TabsContent>
        <TabsContent value="email" className="mt-4">
          <Deliveries />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Actions() {
  const [f, setF] = useState({ entityType: "", action: "" });
  const [page, setPage] = useState(1);
  const q = useRpc<{ rows: any[]; total: number }>("audit.list", {
    ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
    page,
  });
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          aria-label="Entity type"
          placeholder="Entity type (e.g. dispatch_jobs)"
          className={cn(inputCls, "max-w-xs")}
          value={f.entityType}
          onChange={(e) => {
            setF({ ...f, entityType: e.target.value });
            setPage(1);
          }}
        />
        <input
          aria-label="Action prefix"
          placeholder="Action prefix (e.g. user.)"
          className={cn(inputCls, "max-w-xs")}
          value={f.action}
          onChange={(e) => {
            setF({ ...f, action: e.target.value });
            setPage(1);
          }}
        />
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data!.rows.length ? (
        <EmptyState title="No audit entries" />
      ) : (
        <>
          <ul className="divide-y divide-border text-sm">
            {q.data!.rows.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-navy">{r.summary}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <code>{r.action}</code> · {r.entity_type}
                  {r.entity_id ? ` ${String(r.entity_id).slice(0, 8)}` : ""} ·{" "}
                  {r.actor_email ?? "system / public"}
                  {r.request_id ? ` · req ${String(r.request_id).slice(0, 8)}` : ""}
                </div>
                {r.changes && Object.keys(r.changes).length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs">Changes</summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded bg-secondary p-2 text-xs">
                      {JSON.stringify(r.changes, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Newer
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page * 50 >= q.data!.total}
              onClick={() => setPage(page + 1)}
            >
              Older
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}

function Logins() {
  const [email, setEmail] = useState("");
  const q = useRpc<{ rows: any[] }>("audit.logins", email.includes("@") ? { email } : {});
  return (
    <Panel>
      <input
        aria-label="Filter by email"
        placeholder="Filter by exact email"
        className={cn(inputCls, "mb-3 max-w-sm")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data!.rows.length ? (
        <EmptyState title="No sign-in events" />
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Sign-in events</caption>
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              {["When", "Email", "Event", "Detail"].map((h) => (
                <th key={h} scope="col" className="py-1">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.data!.rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1.5">{fmtDateTime(r.created_at)}</td>
                <td>{r.email}</td>
                <td>
                  <StatusBadge
                    value={
                      r.event.includes("fail") || r.event.includes("blocked") ? "failed" : "active"
                    }
                    label={r.event.replace(/_/g, " ")}
                  />
                </td>
                <td className="text-xs text-muted-foreground">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Deliveries() {
  const [status, setStatus] = useState("");
  const q = useRpc<{ rows: any[] }>("notifications.deliveries", { status });
  return (
    <Panel>
      <select
        aria-label="Delivery status"
        className={cn(inputCls, "mb-3 w-auto")}
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="">All</option>
        <option value="sent">Sent</option>
        <option value="failed">Failed</option>
        <option value="skipped">Skipped (not configured)</option>
      </select>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data!.rows.length ? (
        <EmptyState title="No emails recorded" />
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Email delivery log</caption>
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              {["When", "Template", "Recipient", "Status", "Error"].map((h) => (
                <th key={h} scope="col" className="py-1">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.data!.rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1.5">{fmtDateTime(r.created_at)}</td>
                <td className="font-mono text-xs">{r.template}</td>
                <td>{r.recipient}</td>
                <td>
                  <StatusBadge value={r.status} />
                </td>
                <td className="text-xs text-muted-foreground">{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
