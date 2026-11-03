import { z } from "zod";
import { AppError } from "@/lib/shared/errors";
import {
  getResource,
  type FieldDef,
  type ResourceDef,
  type ResourceKey,
} from "@/lib/shared/resources";
import { buildResourceSchema, sanitizeSearchTerm } from "@/lib/shared/resource-schema";
import type { Permission } from "@/lib/shared/permissions";
import { audit, diff } from "../audit.server";
import { actorOf, requirePermission, type StaffContext } from "../authz.server";
import { check, db } from "../db.server";
import { RESOURCE_HOOKS } from "./resource-hooks.server";

export type Row = Record<string, unknown> & { id: string };

export function resourceOrThrow(key: string): ResourceDef {
  const def = getResource(key);
  if (!def) throw new AppError("NOT_FOUND", "Unknown record type.");
  return def;
}

const selectColumns = (def: ResourceDef) =>
  [
    "id",
    "created_at",
    ...(def.archivable ? ["archived_at"] : []),
    ...(def.extraSelect ?? []),
    ...def.fields.map((f) => f.name),
  ]
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(",");

export const ListInput = z.object({
  resource: z.string(),
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
  search: z.string().max(200).optional().default(""),
  filters: z
    .record(z.string(), z.union([z.string(), z.boolean(), z.null()]))
    .optional()
    .default({}),
  sort: z.object({ column: z.string(), ascending: z.boolean() }).optional(),
  includeArchived: z.boolean().optional().default(false),
  dateRange: z
    .object({ column: z.string(), from: z.string().optional(), to: z.string().optional() })
    .optional(),
});
export type ListParams = z.infer<typeof ListInput>;

function applyQuery(def: ResourceDef, q: any, p: ListParams) {
  const fieldNames = new Set(def.fields.map((f) => f.name));
  const filterable = new Map<string, FieldDef>(
    def.fields.filter((f) => f.filter || f.type === "ref").map((f) => [f.name, f]),
  );
  for (const [k, v] of Object.entries(p.filters)) {
    if (v === "" || v === undefined) continue;
    const f = filterable.get(k);
    if (!f) throw new AppError("VALIDATION", `Cannot filter on ${k}`);
    if (v === null || v === "__none") q = q.is(k, null);
    else if (f.type === "boolean") q = q.eq(k, v === true || v === "true");
    else if (f.type === "select" && !(f.options ?? []).some((o) => o.value === v))
      throw new AppError("VALIDATION", `Invalid filter value for ${k}`);
    else if (f.type === "ref" && !/^[0-9a-f-]{36}$/i.test(String(v)))
      throw new AppError("VALIDATION", `Invalid filter value for ${k}`);
    else q = q.eq(k, v);
  }
  if (def.archivable && !p.includeArchived) q = q.is("archived_at", null);
  const term = sanitizeSearchTerm(p.search ?? "");
  if (term) {
    const cols = def.fields.filter((f) => f.searchable).map((f) => `${f.name}.ilike.%${term}%`);
    if (cols.length) q = q.or(cols.join(","));
  }
  if (p.dateRange) {
    const col = p.dateRange.column;
    if (!(fieldNames.has(col) || col === "created_at"))
      throw new AppError("VALIDATION", "Invalid date column");
    if (p.dateRange.from) q = q.gte(col, p.dateRange.from);
    if (p.dateRange.to) q = q.lte(col, p.dateRange.to);
  }
  return q;
}

export async function listResource(ctx: StaffContext, p: ListParams) {
  const def = resourceOrThrow(p.resource);
  requirePermission(ctx, def.read);
  const hooks = RESOURCE_HOOKS[def.key];
  let q = db().from(def.table).select(selectColumns(def), { count: "exact" });
  q = applyQuery(def, q, p);
  if (hooks?.scopeList) q = hooks.scopeList(ctx, q);
  const sort =
    p.sort && (def.fields.some((f) => f.name === p.sort!.column) || p.sort.column === "created_at")
      ? p.sort
      : def.defaultSort;
  q = q.order(sort.column, { ascending: sort.ascending, nullsFirst: false });
  if (sort.column !== "created_at") q = q.order("created_at", { ascending: false });
  const from = (p.page - 1) * p.pageSize;
  const res = await q.range(from, from + p.pageSize - 1);
  const rows = (check(res, `Loading ${def.label}`) ?? []) as unknown as Row[];
  return {
    rows,
    total: res.count ?? rows.length,
    page: p.page,
    pageSize: p.pageSize,
    refLabels: await resolveRefLabels(def, rows),
  };
}

export async function getResourceRow(ctx: StaffContext, key: string, id: string) {
  const def = resourceOrThrow(key);
  requirePermission(ctx, def.read);
  const res = await db().from(def.table).select(selectColumns(def)).eq("id", id).maybeSingle();
  const row = check(res, `Loading ${def.singular}`) as unknown as Row | null;
  if (!row) throw new AppError("NOT_FOUND", `${def.singular} not found.`);
  return { row, refLabels: await resolveRefLabels(def, [row]) };
}

// ---- reference labels & options ------------------------------------------------------
const REF_LABEL: Record<string, { table: string; label: string[]; perm: Permission }> = {
  drivers: { table: "drivers", label: ["full_name", "company_name"], perm: "drivers.read" },
  trucks: { table: "trucks", label: ["unit_number", "vehicle_type"], perm: "fleet.read" },
  customers: { table: "customers", label: ["name", "company"], perm: "crm.read" },
  leads: { table: "leads", label: ["name", "company"], perm: "crm.read" },
  projects: { table: "projects", label: ["project_number", "name"], perm: "projects.read" },
  dispatch_jobs: {
    table: "dispatch_jobs",
    label: ["dispatch_number", "pickup_location"],
    perm: "dispatch.read",
  },
};

const joinLabel = (r: Record<string, unknown>, cols: string[]) =>
  cols
    .map((c) => r[c])
    .filter(Boolean)
    .join(" · ") || String(r.id).slice(0, 8);

async function resolveRefLabels(def: ResourceDef, rows: Row[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const byTarget = new Map<string, Set<string>>();
  for (const f of def.fields) {
    if (f.type !== "ref" || !f.ref) continue;
    for (const r of rows) {
      const v = r[f.name];
      if (typeof v === "string") {
        if (!byTarget.has(f.ref)) byTarget.set(f.ref, new Set());
        byTarget.get(f.ref)!.add(v);
      }
    }
  }
  await Promise.all(
    [...byTarget.entries()].map(async ([target, ids]) => {
      const list = [...ids];
      if (target === "staff") {
        const { data } = await db()
          .from("staff_profiles")
          .select("user_id,full_name,email")
          .in("user_id", list);
        for (const s of data ?? []) out[s.user_id] = s.full_name || s.email;
        return;
      }
      const meta = REF_LABEL[target];
      if (!meta) return;
      const { data } = await db()
        .from(meta.table)
        .select(["id", ...meta.label].join(","))
        .in("id", list);
      for (const r of (data ?? []) as unknown as Record<string, unknown>[])
        out[String(r.id)] = joinLabel(r, meta.label);
    }),
  );
  return out;
}

export async function refOptions(ctx: StaffContext, target: string, search: string) {
  const term = sanitizeSearchTerm(search);
  if (target === "staff") {
    requirePermission(ctx, "dashboard.view");
    let q = db()
      .from("staff_profiles")
      .select("user_id,full_name,email")
      .eq("active", true)
      .order("full_name")
      .limit(50);
    if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
    const { data } = await q;
    return (data ?? []).map((s: { user_id: string; full_name: string | null; email: string }) => ({
      value: s.user_id,
      label: s.full_name || s.email,
    }));
  }
  const meta = REF_LABEL[target];
  if (!meta) throw new AppError("NOT_FOUND", "Unknown reference.");
  requirePermission(ctx, meta.perm);
  let q = db()
    .from(meta.table)
    .select(["id", ...meta.label].join(","))
    .limit(50);
  const def = getResource(target);
  if (def?.archivable) q = q.is("archived_at", null);
  if (term) q = q.or(meta.label.map((c) => `${c}.ilike.%${term}%`).join(","));
  q = q.order(meta.label[0]);
  const { data } = await q;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    value: String(r.id),
    label: joinLabel(r, meta.label),
  }));
}

// ---- mutations -----------------------------------------------------------------------
export async function createResource(
  ctx: StaffContext,
  key: string,
  values: unknown,
  opts: { confirmDuplicate?: boolean } = {},
) {
  const def = resourceOrThrow(key);
  requirePermission(ctx, def.write);
  if (!def.creatable) throw new AppError("FORBIDDEN", `${def.label} cannot be created here.`);
  const parsed = buildResourceSchema(def, "create").safeParse(values ?? {});
  if (!parsed.success) throw validationError(parsed.error);
  let data: Record<string, unknown> = { ...defaultsFor(def), ...parsed.data };
  const hooks = RESOURCE_HOOKS[def.key];
  if (hooks?.beforeCreate) data = await hooks.beforeCreate(ctx, data, opts);
  if (def.createdByColumn) data[def.createdByColumn] = ctx.userId;
  const row = check(
    await db().from(def.table).insert(data).select(selectColumns(def)).single(),
    `Creating ${def.singular}`,
  ) as unknown as Row;
  if (hooks?.afterWrite) await hooks.afterWrite(ctx, null, row);
  await audit(
    actorOf(ctx),
    `${def.key}.create`,
    def.key,
    row.id,
    `Created ${def.singular.toLowerCase()} ${String(row[def.titleField] ?? "")}`,
    diff(null, data),
  );
  return { row };
}

export async function updateResource(ctx: StaffContext, key: string, id: string, values: unknown) {
  const def = resourceOrThrow(key);
  requirePermission(ctx, def.write);
  const parsed = buildResourceSchema(def, "update").safeParse(values ?? {});
  if (!parsed.success) throw validationError(parsed.error);
  const before = check(
    await db().from(def.table).select(selectColumns(def)).eq("id", id).maybeSingle(),
    `Loading ${def.singular}`,
  ) as unknown as Row | null;
  if (!before) throw new AppError("NOT_FOUND", `${def.singular} not found.`);
  let data: Record<string, unknown> = parsed.data;
  const hooks = RESOURCE_HOOKS[def.key];
  if (hooks?.beforeUpdate) data = await hooks.beforeUpdate(ctx, before, data);
  const changes = diff(before, data);
  if (Object.keys(changes).length === 0) return { row: before };
  const row = check(
    await db().from(def.table).update(data).eq("id", id).select(selectColumns(def)).single(),
    `Updating ${def.singular}`,
  ) as unknown as Row;
  if (hooks?.afterWrite) await hooks.afterWrite(ctx, before, row);
  await audit(
    actorOf(ctx),
    `${def.key}.update`,
    def.key,
    id,
    `Updated ${def.singular.toLowerCase()} ${String(row[def.titleField] ?? "")}`,
    changes,
  );
  return { row };
}

export async function archiveResource(ctx: StaffContext, key: string, id: string, restore = false) {
  const def = resourceOrThrow(key);
  requirePermission(ctx, def.write);
  if (!def.archivable) throw new AppError("BAD_REQUEST", `${def.label} cannot be archived.`);
  const hooks = RESOURCE_HOOKS[def.key];
  if (hooks?.beforeUpdate) {
    const before = check(
      await db().from(def.table).select(selectColumns(def)).eq("id", id).maybeSingle(),
      "Loading",
    ) as unknown as Row | null;
    if (!before) throw new AppError("NOT_FOUND", `${def.singular} not found.`);
    await hooks.beforeUpdate(ctx, before, {});
  }
  check(
    await db()
      .from(def.table)
      .update({ archived_at: restore ? null : new Date().toISOString() })
      .eq("id", id),
    "Archiving",
  );
  await audit(
    actorOf(ctx),
    `${def.key}.${restore ? "restore" : "archive"}`,
    def.key,
    id,
    `${restore ? "Restored" : "Archived"} ${def.singular.toLowerCase()}`,
  );
  return { ok: true };
}

export async function deleteResource(ctx: StaffContext, key: string, id: string) {
  const def = resourceOrThrow(key);
  requirePermission(ctx, def.write);
  if (!def.deletable)
    throw new AppError("BAD_REQUEST", `${def.label} cannot be deleted; archive instead.`);
  const before = check(
    await db().from(def.table).select(selectColumns(def)).eq("id", id).maybeSingle(),
    "Loading",
  ) as unknown as Row | null;
  if (!before) throw new AppError("NOT_FOUND", `${def.singular} not found.`);
  check(await db().from(def.table).delete().eq("id", id), `Deleting ${def.singular}`);
  await audit(
    actorOf(ctx),
    `${def.key}.delete`,
    def.key,
    id,
    `Deleted ${def.singular.toLowerCase()} ${String(before[def.titleField] ?? "")}`,
    diff(before, {}),
  );
  return { ok: true };
}

// ---- export ----------------------------------------------------------------------------
function csvCell(v: unknown) {
  if (v == null) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportResource(ctx: StaffContext, p: ListParams) {
  const def = resourceOrThrow(p.resource);
  requirePermission(ctx, def.read);
  if (!def.export) throw new AppError("FORBIDDEN", `${def.label} cannot be exported.`);
  requirePermission(ctx, def.export);
  const all: Row[] = [];
  let labels: Record<string, string> = {};
  for (let page = 1; page <= 50; page++) {
    const res = await listResource(ctx, { ...p, page, pageSize: 200 });
    all.push(...res.rows);
    labels = { ...labels, ...res.refLabels };
    if (res.rows.length < 200) break;
  }
  const cols = def.fields.filter((f) => !f.sensitive);
  const header = ["id", ...cols.map((f) => f.label), "created_at"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of all) {
    lines.push(
      [
        r.id,
        ...cols.map((f) =>
          f.type === "ref" && r[f.name] ? (labels[String(r[f.name])] ?? r[f.name]) : r[f.name],
        ),
        r.created_at,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  await audit(
    actorOf(ctx),
    `${def.key}.export`,
    def.key,
    null,
    `Exported ${all.length} ${def.label.toLowerCase()} (sensitive columns excluded)`,
    { search: p.search, filters: p.filters },
  );
  return {
    filename: `${def.key}-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: lines.join("\n"),
    count: all.length,
  };
}

// ---- helpers ---------------------------------------------------------------------------
function defaultsFor(def: ResourceDef) {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) if (f.default !== undefined && !f.readonly) out[f.name] = f.default;
  return out;
}

function validationError(err: z.ZodError) {
  const issue = err.issues[0];
  const msg =
    issue?.code === "unrecognized_keys"
      ? "Unexpected fields in request."
      : (issue?.message ?? "Validation failed");
  return new AppError("VALIDATION", msg, {
    field: issue?.path?.join("."),
    issues: err.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

export type ResourceHooks = {
  scopeList?: (ctx: StaffContext, q: any) => any;
  beforeCreate?: (
    ctx: StaffContext,
    data: Record<string, unknown>,
    opts: { confirmDuplicate?: boolean },
  ) => Promise<Record<string, unknown>>;
  beforeUpdate?: (
    ctx: StaffContext,
    before: Row,
    data: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  afterWrite?: (ctx: StaffContext, before: Row | null, after: Row) => Promise<void>;
};
export type { ResourceKey };
