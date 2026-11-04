import { AppError } from "@/lib/shared/errors";
import { createDb, type Db } from "./pg/query";
import { query } from "./pg/pool.server";

/**
 * Database client for AMCMS (self-hosted PostgreSQL). It connects as the schema owner, so it is
 * only reachable from server modules after the caller has been authenticated and authorised
 * (see authz.server.ts). Every value is a bound parameter.
 */
let instance: Db | undefined;
export const db = (): Db => (instance ??= createDb((sql, params) => query(sql, params)));

/** Throws a sanitized error for a database error, mapping known constraint failures. */
export function check<T>(
  res: { data: T; error: { code?: string; message: string; details?: string | null } | null },
  what = "Database operation",
): T {
  if (!res.error) return res.data;
  const e = res.error;
  if (e.code === "23P01")
    throw new AppError(
      "CONFLICT",
      "That time overlaps another booking for the same driver, truck, or slot.",
    );
  if (e.code === "23505")
    throw new AppError("CONFLICT", "A record with that value already exists.");
  if (e.code === "23503") throw new AppError("VALIDATION", "A linked record does not exist.");
  if (e.code === "23514") throw new AppError("VALIDATION", "One or more values are not allowed.");
  if (e.code === "PGRST116") throw new AppError("NOT_FOUND", "Record not found.");
  console.error(
    JSON.stringify({ level: "error", msg: `${what} failed`, code: e.code, error: e.message }),
  );
  throw new AppError("INTERNAL", `${what} failed.`);
}
