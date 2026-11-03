import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  ArchiveRestore,
  Download,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  RESOURCES,
  type FieldDef,
  type ResourceDef,
  type ResourceKey,
} from "@/lib/shared/resources";
import { labelFor } from "@/lib/shared/domain";
import { formatMoney } from "@/lib/shared/quote-math";
import {
  downloadText,
  fmtDate,
  fmtDateTime,
  rpc,
  useRpc,
  useRpcMutation,
  type RpcError,
} from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import { ConfirmButton, EmptyState, ErrorState, LoadingState, StatusBadge, inputCls } from "./kit";
import { ResourceForm } from "./ResourceForm";
import { RefSelect } from "./RefSelect";
import { cn } from "@/lib/utils";

type Row = Record<string, any> & { id: string };
type ListResult = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  refLabels: Record<string, string>;
};

export function renderCell(f: FieldDef, row: Row, refLabels: Record<string, string>): ReactNode {
  const v = row[f.name];
  if (v === null || v === undefined || v === "")
    return <span className="text-muted-foreground">—</span>;
  switch (f.type) {
    case "select":
      return ["status", "stage", "availability", "priority"].includes(f.name) ? (
        <StatusBadge value={String(v)} label={labelFor(f.options ?? [], String(v))} />
      ) : (
        labelFor(f.options ?? [], String(v))
      );
    case "boolean":
      return v ? "Yes" : "No";
    case "date":
      return fmtDate(v);
    case "datetime":
      return fmtDateTime(v);
    case "money":
      return formatMoney(v);
    case "ref":
      return refLabels[String(v)] ?? <span className="text-muted-foreground">(linked)</span>;
    case "textarea":
      return <span className="line-clamp-2 max-w-md">{String(v)}</span>;
    default:
      return String(v);
  }
}

export function ResourceManager({
  resource,
  fixedFilters,
  preset,
  hiddenFields,
  columns,
  detail,
  openId,
  onOpenChange,
  compact,
  emptyHint,
  toolbar,
  createLabel,
}: {
  resource: ResourceKey;
  /** Filters that always apply (e.g. child records of a parent). Also preset on create. */
  fixedFilters?: Record<string, string>;
  preset?: Record<string, unknown>;
  hiddenFields?: string[];
  columns?: string[];
  detail?: (row: Row, refLabels: Record<string, string>) => ReactNode;
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
  compact?: boolean;
  emptyHint?: string;
  toolbar?: ReactNode;
  createLabel?: string;
}) {
  const def: ResourceDef = RESOURCES[resource];
  const can = useCan();
  const canWrite = can(def.write);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(def.defaultSort);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<string | null>(openId ?? null);
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<RpcError | null>(null);
  const [dupConfirm, setDupConfirm] = useState<{
    values: Record<string, unknown>;
    duplicates: any[];
  } | null>(null);
  const pageSize = compact ? 10 : 25;

  useEffect(() => setSelected(openId ?? null), [openId]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const allFilters = { ...filters, ...(fixedFilters ?? {}) };
  const listInput = {
    resource,
    page,
    pageSize,
    search: debounced,
    filters: allFilters,
    sort,
    includeArchived,
  };
  const list = useRpc<ListResult>("resource.list", listInput, { placeholderData: (p) => p });
  const detailQ = useRpc<{ row: Row; refLabels: Record<string, string> }>(
    "resource.get",
    { resource, id: selected },
    { enabled: Boolean(selected) },
  );

  const open = (id: string | null) => {
    setSelected(id);
    setServerError(null);
    onOpenChange?.(id);
  };
  const create = useRpcMutation<
    { row: Row },
    { resource: string; values: Record<string, unknown>; confirmDuplicate?: boolean }
  >("resource.create", {
    invalidate: ["resource.", "dashboard.", "crm.", "dispatch.", "projects."],
    success: `${def.singular} created`,
    silentError: true,
    onSuccess: (r) => {
      setCreating(false);
      setDupConfirm(null);
      open(r.row.id);
    },
  });
  const update = useRpcMutation("resource.update", {
    invalidate: ["resource.", "dashboard.", "crm.", "dispatch.", "projects."],
    success: "Saved",
    silentError: true,
    onSuccess: () => setServerError(null),
  });
  const archive = useRpcMutation("resource.archive", {
    invalidate: ["resource.", "dashboard."],
    success: "Updated",
  });
  const del = useRpcMutation("resource.delete", {
    invalidate: ["resource.", "dashboard."],
    success: "Deleted",
    onSuccess: () => open(null),
  });

  const cols = useMemo(
    () =>
      (columns
        ? columns.map((c) => def.fields.find((f) => f.name === c)!).filter(Boolean)
        : def.fields.filter((f) => f.list)
      ).filter((f) => !(fixedFilters && f.name in fixedFilters)),
    [columns, def, fixedFilters],
  );
  const filterFields = def.fields.filter(
    (f) => f.filter && !(fixedFilters && f.name in fixedFilters),
  );
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / pageSize)) : 1;

  async function doExport() {
    try {
      const r = await rpc<{ filename: string; csv: string; count: number }>("resource.export", {
        ...listInput,
        page: 1,
      });
      downloadText(r.filename, r.csv);
    } catch (e) {
      (await import("sonner")).toast.error((e as Error).message);
    }
  }

  function submitCreate(values: Record<string, unknown>, confirmDuplicate = false) {
    setServerError(null);
    create.mutate(
      { resource, values: { ...(fixedFilters ?? {}), ...values }, confirmDuplicate },
      {
        onError: (e) => {
          if (e.code === "CONFLICT" && (e.details as any)?.duplicates)
            setDupConfirm({ values, duplicates: (e.details as any).duplicates });
          else setServerError(e);
        },
      },
    );
  }

  const toggleSort = (c: string) =>
    setSort((s) =>
      s.column === c ? { column: c, ascending: !s.ascending } : { column: c, ascending: true },
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            aria-label={`Search ${def.label}`}
            placeholder={`Search ${def.label.toLowerCase()}…`}
            className={cn(inputCls, "pl-8")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filterFields.map((f) =>
          f.type === "ref" ? (
            <div key={f.name} className="w-48">
              <RefSelect
                target={f.ref!}
                value={filters[f.name] || null}
                onChange={(v) => {
                  setFilters((s) => ({ ...s, [f.name]: v ?? "" }));
                  setPage(1);
                }}
                placeholder={`Any ${f.label.toLowerCase()}`}
                ariaLabel={`Filter by ${f.label}`}
              />
            </div>
          ) : (
            <select
              key={f.name}
              aria-label={`Filter by ${f.label}`}
              className={cn(inputCls, "w-auto")}
              value={filters[f.name] ?? ""}
              onChange={(e) => {
                setFilters((s) => ({ ...s, [f.name]: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All {f.label.toLowerCase()}</option>
              {f.type === "boolean" ? (
                <>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </>
              ) : (
                (f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))
              )}
            </select>
          ),
        )}
        {def.archivable && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />{" "}
            Show archived
          </label>
        )}
        {toolbar}
        {def.export && can(def.export) && !compact && (
          <Button variant="outline" size="sm" onClick={doExport}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden /> Export CSV
          </Button>
        )}
        {def.creatable && canWrite && (
          <Button
            size="sm"
            className="bg-navy text-white hover:bg-navy/90"
            onClick={() => {
              setServerError(null);
              setCreating(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />{" "}
            {createLabel ?? `New ${def.singular.toLowerCase()}`}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        {list.isLoading ? (
          <LoadingState />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data?.rows.length ? (
          <EmptyState
            title={
              debounced || Object.values(filters).some(Boolean)
                ? "No matching records"
                : `No ${def.label.toLowerCase()} yet`
            }
            body={emptyHint}
          />
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">{def.label}</caption>
            <thead className="bg-secondary/60 text-left">
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.name}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 font-semibold text-navy"
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded focus-visible:focus-brand"
                      onClick={() => toggleSort(c.name)}
                      aria-label={`Sort by ${c.label}`}
                    >
                      {c.label}
                      {sort.column === c.name &&
                        (sort.ascending ? (
                          <ArrowUp className="h-3 w-3" aria-hidden />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden />
                        ))}
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t border-border hover:bg-secondary/40",
                    r.archived_at && "opacity-60",
                  )}
                >
                  {cols.map((c, i) => (
                    <td key={c.name} className="px-3 py-2 align-top">
                      {i === 0 ? (
                        <button
                          type="button"
                          className="text-left font-medium text-navy underline-offset-2 hover:underline focus-visible:focus-brand rounded"
                          onClick={() => open(r.id)}
                        >
                          {renderCell(c, r, list.data!.refLabels)}
                        </button>
                      ) : (
                        renderCell(c, r, list.data!.refLabels)
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => open(r.id)}
                      aria-label={`Open ${def.singular} ${String(r[def.titleField] ?? "")}`}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {list.data && list.data.total > pageSize && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between text-sm text-muted-foreground"
        >
          <span>
            {list.data.total} records · page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
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
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      )}

      {/* Create */}
      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>New {def.singular.toLowerCase()}</SheetTitle>
            <SheetDescription>Fields marked * are required.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {dupConfirm ? (
              <div
                role="alert"
                className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"
              >
                <p className="font-semibold text-amber-900">Possible duplicate</p>
                <ul className="list-disc pl-5">
                  {dupConfirm.duplicates.map((d) => (
                    <li key={d.id}>
                      {d.type}: {d.name} {d.company ? `· ${d.company}` : ""}{" "}
                      {d.email ? `· ${d.email}` : ""}
                    </li>
                  ))}
                </ul>
                <p>
                  Distinct people can share a phone or company. Only continue if this is a different
                  record.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDupConfirm(null)}>
                    Back
                  </Button>
                  <Button size="sm" onClick={() => submitCreate(dupConfirm.values, true)}>
                    Create anyway
                  </Button>
                </div>
              </div>
            ) : (
              <ResourceForm
                def={def}
                preset={preset}
                hiddenFields={[...(hiddenFields ?? []), ...Object.keys(fixedFilters ?? {})]}
                submitting={create.isPending}
                serverError={serverError}
                onSubmit={(v) => submitCreate(v)}
                onCancel={() => setCreating(false)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Detail / edit */}
      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && open(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>
              {detailQ.data
                ? String(detailQ.data.row[def.titleField] ?? def.singular)
                : def.singular}
            </SheetTitle>
            <SheetDescription>
              {detailQ.data?.row.created_at
                ? `Created ${fmtDateTime(detailQ.data.row.created_at)}`
                : ""}
              {detailQ.data?.row.archived_at ? " · Archived" : ""}
              {!canWrite ? " · Read-only" : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {detailQ.isLoading ? (
              <LoadingState />
            ) : detailQ.error ? (
              <ErrorState error={detailQ.error} />
            ) : detailQ.data ? (
              <>
                <ResourceForm
                  def={def}
                  row={detailQ.data.row}
                  refLabels={detailQ.data.refLabels}
                  readOnly={!canWrite || Boolean(detailQ.data.row.archived_at)}
                  hiddenFields={[...(hiddenFields ?? []), ...Object.keys(fixedFilters ?? {})]}
                  submitting={update.isPending}
                  serverError={update.error}
                  onSubmit={(values) => update.mutate({ resource, id: selected, values })}
                />
                {canWrite && (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    {def.archivable &&
                      (detailQ.data.row.archived_at ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => archive.mutate({ resource, id: selected, restore: true })}
                        >
                          <ArchiveRestore className="mr-1.5 h-4 w-4" aria-hidden /> Restore
                        </Button>
                      ) : (
                        <ConfirmButton
                          title={`Archive this ${def.singular.toLowerCase()}?`}
                          description="Archived records are hidden from lists but kept for history. You can restore them later."
                          confirmLabel="Archive"
                          onConfirm={() =>
                            archive.mutateAsync({ resource, id: selected, restore: false })
                          }
                        >
                          <Archive className="mr-1.5 h-4 w-4" aria-hidden /> Archive
                        </ConfirmButton>
                      ))}
                    {def.deletable && (
                      <ConfirmButton
                        variant="destructive"
                        title={`Delete this ${def.singular.toLowerCase()}?`}
                        description="This permanently removes the record. The action is recorded in the audit log."
                        confirmLabel="Delete"
                        onConfirm={() => del.mutateAsync({ resource, id: selected })}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" aria-hidden /> Delete
                      </ConfirmButton>
                    )}
                  </div>
                )}
                {detail?.(detailQ.data.row, detailQ.data.refLabels)}
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
