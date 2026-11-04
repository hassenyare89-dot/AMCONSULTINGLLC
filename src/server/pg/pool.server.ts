import pg from "pg";

/**
 * PostgreSQL connection pool. Values are parsed to match what the services expect (the same
 * shapes PostgREST returned): ISO-8601 timestamps, plain YYYY-MM-DD dates, numbers for
 * numeric/bigint columns.
 */
const { Pool, types } = pg;

const toIso = (v: string) => {
  // "2026-11-04 03:17:31.123+00" -> "2026-11-04T03:17:31.123+00:00"
  let s = v.replace(" ", "T");
  if (/[+-]\d\d$/.test(s)) s += ":00";
  return s;
};
types.setTypeParser(1184, toIso); // timestamptz
types.setTypeParser(1114, (v) => `${v.replace(" ", "T")}Z`); // timestamp (stored as UTC)
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1700, (v) => Number(v)); // numeric
types.setTypeParser(20, (v) => Number(v)); // int8 / bigint

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  const sslMode = process.env.PGSSLMODE;
  pool = new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    options: "-c TimeZone=UTC",
    ssl:
      sslMode && sslMode !== "disable"
        ? { rejectUnauthorized: sslMode === "verify-full" }
        : undefined,
  });
  pool.on("error", (err) =>
    console.error(JSON.stringify({ level: "error", msg: "pg pool error", error: err.message })),
  );
  return pool;
}

export async function query<T = any>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
  const res = await getPool().query(sql, params as any[]);
  return { rows: res.rows as T[] };
}

/** Runs `fn` inside a transaction on a dedicated connection. */
export async function transaction<T>(fn: (q: typeof query) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(async (sql, params = []) => ({
      rows: (await client.query(sql, params as any[])).rows,
    }));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
