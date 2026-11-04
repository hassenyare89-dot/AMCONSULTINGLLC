import { IDENT, parseList, parseOrFilter, type Condition, type FilterOp } from "./filter";

/**
 * A small query builder exposing the chainable subset of the supabase-js / PostgREST API that
 * AMCMS services use, executed directly against PostgreSQL. Identifiers are validated against a
 * strict pattern and quoted; every value is a bound parameter.
 */

export type DbError = { code: string; message: string; details?: string | null };
export type DbResult<T = any> = { data: T; error: DbError | null; count: number | null };
export type Executor = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;

const qi = (name: string) => {
  if (!IDENT.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
};

function columnList(cols: string): string {
  const list = cols
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!list.length || (list.length === 1 && list[0] === "*")) return "*";
  return list.map(qi).join(", ");
}

/** jsonb-friendly value encoding: plain objects/arrays are sent as JSON text. */
function encode(v: unknown): unknown {
  if (v !== null && typeof v === "object" && !(v instanceof Date) && !(v instanceof Uint8Array))
    return JSON.stringify(v);
  return v;
}

class Params {
  values: unknown[] = [];
  add(v: unknown) {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

type Where = (p: Params) => string;

function conditionSql(c: Condition, p: Params): string {
  const col = qi(c.column);
  switch (c.op) {
    case "eq":
      return `${col} = ${p.add(c.value)}`;
    case "neq":
      return `${col} <> ${p.add(c.value)}`;
    case "gt":
      return `${col} > ${p.add(c.value)}`;
    case "gte":
      return `${col} >= ${p.add(c.value)}`;
    case "lt":
      return `${col} < ${p.add(c.value)}`;
    case "lte":
      return `${col} <= ${p.add(c.value)}`;
    case "like":
      return `${col}::text LIKE ${p.add(c.value)}`;
    case "ilike":
      return `${col}::text ILIKE ${p.add(c.value)}`;
    case "in":
      return `${col}::text = ANY(${p.add((c.value as unknown[]).map(String))}::text[])`;
    case "is":
      if (c.value === null) return `${col} IS NULL`;
      if (c.value === true) return `${col} IS TRUE`;
      if (c.value === false) return `${col} IS FALSE`;
      throw new Error("Unsupported IS value");
  }
}

type Op = "select" | "insert" | "update" | "delete" | "upsert";

export class QueryBuilder<T = any> implements PromiseLike<DbResult<T>> {
  private op: Op = "select";
  private cols = "*";
  private returning: string | null = null;
  private countMode: "exact" | null = null;
  private head = false;
  private wheres: Where[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private singleMode: "one" | "maybe" | null = null;
  private rows: Record<string, unknown>[] = [];
  private patch: Record<string, unknown> = {};
  private conflict: string[] = [];
  private ignoreDuplicates = false;

  constructor(
    private table: string,
    private exec: Executor,
  ) {
    qi(table);
  }

  // ---- operations ----------------------------------------------------------------------
  select(cols = "*", opts: { count?: "exact"; head?: boolean } = {}) {
    if (this.op === "select") {
      this.cols = cols;
      this.countMode = opts.count ?? null;
      this.head = Boolean(opts.head);
    } else this.returning = cols;
    return this;
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }
  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    opts: { onConflict?: string; ignoreDuplicates?: boolean } = {},
  ) {
    this.op = "upsert";
    this.rows = Array.isArray(values) ? values : [values];
    if (!opts.onConflict) throw new Error("upsert requires onConflict");
    this.conflict = opts.onConflict.split(",").map((c) => c.trim());
    this.ignoreDuplicates = Boolean(opts.ignoreDuplicates);
    return this;
  }
  update(values: Record<string, unknown>) {
    this.op = "update";
    this.patch = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  // ---- filters -------------------------------------------------------------------------
  private add(column: string, op: FilterOp, value: unknown) {
    this.wheres.push((p) => conditionSql({ column, op, value }, p));
    return this;
  }
  eq(c: string, v: unknown) {
    return this.add(c, "eq", v);
  }
  neq(c: string, v: unknown) {
    return this.add(c, "neq", v);
  }
  gt(c: string, v: unknown) {
    return this.add(c, "gt", v);
  }
  gte(c: string, v: unknown) {
    return this.add(c, "gte", v);
  }
  lt(c: string, v: unknown) {
    return this.add(c, "lt", v);
  }
  lte(c: string, v: unknown) {
    return this.add(c, "lte", v);
  }
  like(c: string, v: string) {
    return this.add(c, "like", v);
  }
  ilike(c: string, v: string) {
    return this.add(c, "ilike", v);
  }
  is(c: string, v: null | boolean) {
    return this.add(c, "is", v);
  }
  in(c: string, values: readonly unknown[]) {
    return this.add(c, "in", [...values]);
  }
  not(c: string, op: "is" | "in" | "eq", value: unknown) {
    const parsed = op === "in" && typeof value === "string" ? parseList(value) : value;
    this.wheres.push((p) => `NOT (${conditionSql({ column: c, op, value: parsed }, p)})`);
    return this;
  }
  or(filter: string) {
    const conds = parseOrFilter(filter);
    this.wheres.push((p) => `(${conds.map((c) => conditionSql(c, p)).join(" OR ")})`);
    return this;
  }

  // ---- modifiers -----------------------------------------------------------------------
  order(column: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const asc = opts.ascending !== false;
    const nullsFirst = opts.nullsFirst ?? !asc; // PostgREST/Postgres default
    this.orders.push(
      `${qi(column)} ${asc ? "ASC" : "DESC"} NULLS ${nullsFirst ? "FIRST" : "LAST"}`,
    );
    return this;
  }
  limit(n: number) {
    this.limitN = Math.max(0, Math.floor(n));
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = Math.max(0, Math.floor(from));
    this.limitN = Math.max(0, Math.floor(to) - Math.floor(from) + 1);
    return this;
  }
  single() {
    this.singleMode = "one";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }

  // ---- SQL generation (exposed for tests) ------------------------------------------------
  private whereSql(p: Params) {
    return this.wheres.length ? ` WHERE ${this.wheres.map((w) => w(p)).join(" AND ")}` : "";
  }

  toSQL(): { sql: string; params: unknown[]; countSql?: { sql: string; params: unknown[] } } {
    const t = qi(this.table);
    const p = new Params();
    if (this.op === "select") {
      let sql = `SELECT ${columnList(this.cols)} FROM ${t}${this.whereSql(p)}`;
      if (this.orders.length) sql += ` ORDER BY ${this.orders.join(", ")}`;
      if (this.limitN !== null) sql += ` LIMIT ${this.limitN}`;
      if (this.offsetN !== null) sql += ` OFFSET ${this.offsetN}`;
      let countSql;
      if (this.countMode) {
        const cp = new Params();
        countSql = {
          sql: `SELECT count(*)::bigint AS count FROM ${t}${this.whereSql(cp)}`,
          params: cp.values,
        };
      }
      return { sql, params: p.values, countSql };
    }
    const ret = this.returning !== null ? ` RETURNING ${columnList(this.returning)}` : "";
    if (this.op === "insert" || this.op === "upsert") {
      if (!this.rows.length) throw new Error("insert requires at least one row");
      const keys = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
      const values = this.rows
        .map(
          (r) =>
            `(${keys.map((k) => (k in r && r[k] !== undefined ? p.add(encode(r[k])) : "DEFAULT")).join(", ")})`,
        )
        .join(", ");
      let sql = `INSERT INTO ${t} (${keys.map(qi).join(", ")}) VALUES ${values}`;
      if (this.op === "upsert") {
        const target = this.conflict.map(qi).join(", ");
        const updates = keys.filter((k) => !this.conflict.includes(k));
        sql +=
          this.ignoreDuplicates || !updates.length
            ? ` ON CONFLICT (${target}) DO NOTHING`
            : ` ON CONFLICT (${target}) DO UPDATE SET ${updates.map((k) => `${qi(k)} = EXCLUDED.${qi(k)}`).join(", ")}`;
      }
      return { sql: sql + ret, params: p.values };
    }
    // Refuse unfiltered UPDATE/DELETE: services always target specific rows.
    if (!this.wheres.length)
      throw new Error(`Refusing unfiltered ${this.op.toUpperCase()} on ${this.table}`);
    if (this.op === "update") {
      const keys = Object.keys(this.patch).filter((k) => this.patch[k] !== undefined);
      if (!keys.length) throw new Error("update requires at least one column");
      const sets = keys.map((k) => `${qi(k)} = ${p.add(encode(this.patch[k]))}`).join(", ");
      return { sql: `UPDATE ${t} SET ${sets}${this.whereSql(p)}${ret}`, params: p.values };
    }
    return { sql: `DELETE FROM ${t}${this.whereSql(p)}${ret}`, params: p.values };
  }

  // ---- execution -----------------------------------------------------------------------
  async execute(): Promise<DbResult<T>> {
    try {
      const { sql, params, countSql } = this.toSQL();
      let count: number | null = null;
      if (countSql)
        count = Number((await this.exec(countSql.sql, countSql.params)).rows[0]?.count ?? 0);
      if (this.op === "select" && this.head) return { data: null as T, error: null, count };
      const { rows } = await this.exec(sql, params);
      const hasRows = this.op === "select" || this.returning !== null;
      if (!hasRows) return { data: null as T, error: null, count };
      if (this.singleMode) {
        if (rows.length > 1 || (this.singleMode === "one" && rows.length === 0)) {
          return {
            data: null as T,
            error: { code: "PGRST116", message: `Expected one row, got ${rows.length}` },
            count,
          };
        }
        return { data: (rows[0] ?? null) as T, error: null, count };
      }
      return { data: rows as T, error: null, count };
    } catch (err) {
      const e = err as { code?: string; message?: string; detail?: string };
      return {
        data: null as T,
        error: {
          code: e.code ?? "QUERY_ERROR",
          message: e.message ?? String(err),
          details: e.detail ?? null,
        },
        count: null,
      };
    }
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((v: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/** Calls a SQL function with named arguments, returning its scalar result. */
export async function callFunction(
  exec: Executor,
  name: string,
  args: Record<string, unknown>,
): Promise<DbResult> {
  try {
    const keys = Object.keys(args);
    keys.forEach(qi);
    const sql = `SELECT ${qi(name)}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) AS result`;
    const { rows } = await exec(
      sql,
      keys.map((k) => encode(args[k])),
    );
    return { data: rows[0]?.result ?? null, error: null, count: null };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return {
      data: null,
      error: { code: e.code ?? "QUERY_ERROR", message: e.message ?? String(err) },
      count: null,
    };
  }
}

export function createDb(exec: Executor) {
  return {
    from: <T = any>(table: string) => new QueryBuilder<T>(table, exec),
    rpc: (name: string, args: Record<string, unknown> = {}) => callFunction(exec, name, args),
  };
}
export type Db = ReturnType<typeof createDb>;
