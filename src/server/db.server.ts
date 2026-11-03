import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "@/lib/shared/errors";

/**
 * Service-role database client for AMCMS tables. It bypasses RLS, so it must only be used
 * after the caller has been authenticated and authorised (see authz.server.ts).
 * Untyped because AMCMS tables are newer than the generated Lovable types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = (): SupabaseClient<any, "public", any> =>
  supabaseAdmin as unknown as SupabaseClient<any, "public", any>;

/** Throws a sanitized error for a PostgREST error, mapping known constraint failures. */
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
