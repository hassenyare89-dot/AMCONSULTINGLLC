import { AppError } from "@/lib/shared/errors";
import { db } from "./db.server";
import { log } from "./logger.server";

/** Per-isolate fallback used only if the database limiter is unavailable. */
const MEM = new Map<string, { hits: number; reset: number }>();
function memoryHit(key: string, max: number, windowSec: number): boolean {
  const now = Date.now();
  if (MEM.size > 5000) for (const [k, v] of MEM) if (v.reset < now) MEM.delete(k);
  const e = MEM.get(key);
  if (!e || e.reset < now) {
    MEM.set(key, { hits: 1, reset: now + windowSec * 1000 });
    return true;
  }
  e.hits += 1;
  return e.hits <= max;
}

/** Returns true when allowed. Shared across all Worker isolates via Postgres. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const { data, error } = await db().rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSec,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    log("warn", "db rate limiter unavailable; using memory fallback", { err });
    return memoryHit(key, max, windowSec);
  }
}

export async function enforceRateLimit(
  key: string,
  max: number,
  windowSec: number,
  message = "Too many requests. Please try again shortly.",
) {
  if (!(await rateLimit(key, max, windowSec))) throw new AppError("RATE_LIMITED", message);
}
