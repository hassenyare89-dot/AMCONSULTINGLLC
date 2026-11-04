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
import { ResourceManager } from "@/components/admin/ResourceManager";
import { fmtDate, fmtDateTime, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/compliance")({
  component: CompliancePage,
});

function CompliancePage() {
  const can = useCan();
  return (
    <>
      <PageHeader
        title="Compliance Records"
        description="Privacy requests, consent records and data-subject lookups. Applicability of state privacy, communications and FMCSA rules must be confirmed with counsel — see docs/08-COMPLIANCE_MATRIX.md."
      />
      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Privacy requests</TabsTrigger>
          <TabsTrigger value="consents">Consent records</TabsTrigger>
          {can("compliance.write") && <TabsTrigger value="lookup">Data-subject lookup</TabsTrigger>}
        </TabsList>
        <TabsContent value="requests" className="mt-4">
          <ResourceManager
            resource="privacy_requests"
            emptyHint="Requests from /privacy/request appear here with a 45-day response target."
            detail={(row) => (
              <p className="text-sm">
                Due by <strong>{fmtDate(row.due_at)}</strong>
                {row.resolved_at ? ` · resolved ${fmtDate(row.resolved_at)}` : ""}. Verify the
                requester's identity before disclosing or deleting data.
              </p>
            )}
          />
        </TabsContent>
        <TabsContent value="consents" className="mt-4">
          <Consents />
        </TabsContent>
        <TabsContent value="lookup" className="mt-4">
          <Lookup />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Consents() {
  const [email, setEmail] = useState("");
  const q = useRpc<{ rows: any[] }>("compliance.consents", email.includes("@") ? { email } : {});
  return (
    <Panel>
      <input
        type="search"
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
        <EmptyState title="No consent records" />
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Consent records</caption>
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              {["When", "Email", "Context", "Consent", "Granted", "Notice version"].map((h) => (
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
                <td>{r.subject_email}</td>
                <td>{r.context}</td>
                <td>{r.consent_type}</td>
                <td>
                  <StatusBadge
                    value={r.granted ? "accepted" : "declined"}
                    label={r.granted ? "yes" : "no"}
                  />
                </td>
                <td className="font-mono text-xs">{r.policy_version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Lookup() {
  const [email, setEmail] = useState("");
  const m = useRpcMutation<{ email: string; found: Record<string, number> }>("compliance.lookup");
  return (
    <Panel title="Find records for a person">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ email });
        }}
      >
        <label htmlFor="dsl" className="sr-only">
          Email
        </label>
        <input
          id="dsl"
          type="email"
          required
          className={cn(inputCls, "max-w-sm")}
          placeholder="person@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" disabled={m.isPending}>
          Search
        </Button>
      </form>
      {m.data && (
        <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
          {Object.entries(m.data.found).map(([t, n]) => (
            <li key={t} className="flex justify-between rounded bg-secondary/50 px-2 py-1">
              <span>{t.replace(/_/g, " ")}</span>
              <span className="tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        The lookup is audited. Deletion must respect legal retention obligations (e.g. business
        records); document the decision in the request's resolution notes.
      </p>
    </Panel>
  );
}
