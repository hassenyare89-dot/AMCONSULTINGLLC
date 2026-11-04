import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState, PageHeader, Panel, inputCls } from "@/components/admin/kit";
import { useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/settings")({ component: SettingsPage });

const DAYS = [
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"],
  ["7", "Sunday"],
] as const;

function SettingsPage() {
  const q = useRpc<{ settings: Record<string, any> }>("settings.get");
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  const s = q.data!.settings;
  return (
    <>
      <PageHeader
        title="System Settings"
        description="Changes are validated on the server and recorded in the audit log."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <BusinessHours value={s["appointments.business_hours"]} />
        <Recipients value={s["notifications.recipients"]} />
        <QuoteDefaults value={s["quotes.defaults"]} />
        <Simple
          k="security.session"
          title="Session security"
          value={s["security.session"]}
          fields={[["idle_timeout_minutes", "Idle sign-out after (minutes)"]]}
        />
        <Simple
          k="retention.policy"
          title="Data retention targets (days)"
          value={s["retention.policy"]}
          fields={Object.keys(s["retention.policy"]).map(
            (k) => [k, k.replace(/_/g, " ")] as [string, string],
          )}
          note="Targets used by the retention runbook (docs/07-OPERATIONS.md). Deletion is a reviewed manual process, not automatic."
        />
      </div>
    </>
  );
}

function useSave(key: string) {
  return useRpcMutation("settings.update", {
    invalidate: ["settings."],
    success: "Settings saved",
  });
}

function Save({ m, onClick }: { m: ReturnType<typeof useSave>; onClick: () => void }) {
  const can = useCan();
  if (!can("settings.write"))
    return (
      <p className="text-xs text-muted-foreground">
        Read-only — settings.write permission required.
      </p>
    );
  return (
    <div className="mt-4 flex items-center gap-3">
      <Button
        size="sm"
        onClick={onClick}
        disabled={m.isPending}
        className="bg-navy text-white hover:bg-navy/90"
      >
        Save
      </Button>
      {m.error && (
        <p role="alert" className="text-sm text-destructive">
          {m.error.message}
        </p>
      )}
    </div>
  );
}

function BusinessHours({ value }: { value: any }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const m = useSave("appointments.business_hours");
  return (
    <Panel title="Consultation availability">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="tz">Timezone (IANA)</Label>
          <input
            id="tz"
            className={cn(inputCls, "mt-1")}
            value={v.timezone}
            onChange={(e) => setV({ ...v, timezone: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="slot">Slot length (minutes)</Label>
          <input
            id="slot"
            type="number"
            min={15}
            max={240}
            className={cn(inputCls, "mt-1")}
            value={v.slot_minutes}
            onChange={(e) => setV({ ...v, slot_minutes: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="notice">Minimum notice (hours)</Label>
          <input
            id="notice"
            type="number"
            min={0}
            className={cn(inputCls, "mt-1")}
            value={v.min_notice_hours}
            onChange={(e) => setV({ ...v, min_notice_hours: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="ahead">Bookable days ahead</Label>
          <input
            id="ahead"
            type="number"
            min={1}
            className={cn(inputCls, "mt-1")}
            value={v.max_days_ahead}
            onChange={(e) => setV({ ...v, max_days_ahead: Number(e.target.value) })}
          />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.require_approval !== false}
          onChange={(e) => setV({ ...v, require_approval: e.target.checked })}
        />{" "}
        Bookings need staff confirmation
      </label>
      <fieldset className="mt-3 space-y-2">
        <legend className="text-sm font-medium">Open hours</legend>
        {DAYS.map(([d, name]) => {
          const open = Boolean(v.days[d]);
          return (
            <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-32 items-center gap-2">
                <input
                  type="checkbox"
                  checked={open}
                  onChange={(e) => {
                    const days = { ...v.days };
                    if (e.target.checked) days[d] = ["09:00", "17:00"];
                    else delete days[d];
                    setV({ ...v, days });
                  }}
                />
                {name}
              </label>
              {open && (
                <>
                  <input
                    aria-label={`${name} opens`}
                    type="time"
                    className={cn(inputCls, "w-32")}
                    value={v.days[d][0]}
                    onChange={(e) =>
                      setV({ ...v, days: { ...v.days, [d]: [e.target.value, v.days[d][1]] } })
                    }
                  />
                  <span>to</span>
                  <input
                    aria-label={`${name} closes`}
                    type="time"
                    className={cn(inputCls, "w-32")}
                    value={v.days[d][1]}
                    onChange={(e) =>
                      setV({ ...v, days: { ...v.days, [d]: [v.days[d][0], e.target.value] } })
                    }
                  />
                </>
              )}
            </div>
          );
        })}
      </fieldset>
      <Save m={m} onClick={() => m.mutate({ key: "appointments.business_hours", value: v })} />
    </Panel>
  );
}

function Recipients({ value }: { value: Record<string, string[]> }) {
  const [v, setV] = useState(() =>
    Object.fromEntries(Object.entries(value).map(([k, a]) => [k, a.join(", ")])),
  );
  const m = useSave("notifications.recipients");
  return (
    <Panel title="Internal email recipients">
      <p className="mb-3 text-xs text-muted-foreground">
        Comma-separated. When empty, LEAD_RECIPIENT_EMAIL is used.
      </p>
      {Object.keys(v).map((k) => (
        <div key={k} className="mb-2">
          <Label htmlFor={`rcp-${k}`} className="capitalize">
            {k}
          </Label>
          <input
            id={`rcp-${k}`}
            className={cn(inputCls, "mt-1")}
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
          />
        </div>
      ))}
      <Save
        m={m}
        onClick={() =>
          m.mutate({
            key: "notifications.recipients",
            value: Object.fromEntries(
              Object.entries(v).map(([k, s]) => [
                k,
                s
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              ]),
            ),
          })
        }
      />
    </Panel>
  );
}

function QuoteDefaults({ value }: { value: any }) {
  const [v, setV] = useState(value);
  const m = useSave("quotes.defaults");
  return (
    <Panel title="Estimate defaults">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="vd">Valid for (days)</Label>
          <input
            id="vd"
            type="number"
            min={1}
            className={cn(inputCls, "mt-1")}
            value={v.valid_days}
            onChange={(e) => setV({ ...v, valid_days: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="tr">Default tax rate (decimal)</Label>
          <input
            id="tr"
            type="number"
            step="0.0001"
            min={0}
            max={0.5}
            className={cn(inputCls, "mt-1")}
            value={v.tax_rate}
            onChange={(e) => setV({ ...v, tax_rate: Number(e.target.value) })}
          />
        </div>
      </div>
      <Label htmlFor="terms" className="mt-3 block">
        Default terms
      </Label>
      <textarea
        id="terms"
        className={cn(inputCls, "mt-1 min-h-24")}
        value={v.terms}
        onChange={(e) => setV({ ...v, terms: e.target.value })}
      />
      <Save m={m} onClick={() => m.mutate({ key: "quotes.defaults", value: v })} />
    </Panel>
  );
}

function Simple({
  k,
  title,
  value,
  fields,
  note,
}: {
  k: string;
  title: string;
  value: Record<string, number>;
  fields: [string, string][];
  note?: string;
}) {
  const [v, setV] = useState(value);
  const m = useSave(k);
  return (
    <Panel title={title}>
      {note && <p className="mb-3 text-xs text-muted-foreground">{note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([f, label]) => (
          <div key={f}>
            <Label htmlFor={`${k}-${f}`} className="capitalize">
              {label}
            </Label>
            <input
              id={`${k}-${f}`}
              type="number"
              className={cn(inputCls, "mt-1")}
              value={v[f]}
              onChange={(e) => setV({ ...v, [f]: Number(e.target.value) })}
            />
          </div>
        ))}
      </div>
      <Save m={m} onClick={() => m.mutate({ key: k, value: v })} />
    </Panel>
  );
}
