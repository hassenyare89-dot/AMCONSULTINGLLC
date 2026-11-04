import { AppError } from "@/lib/shared/errors";
import { env } from "./env.server";
import { log } from "./logger.server";

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

export function requestId(request?: Request): string {
  const incoming = request?.headers.get("x-request-id");
  return incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
}

/** Rejects cross-site browser POSTs to public endpoints (CSRF / form abuse defence). */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return; // non-browser clients; still subject to rate limits and validation
  let host = "";
  try {
    host = new URL(request.url).host;
  } catch {
    /* ignore */
  }
  const allowed = new Set(
    [...env.allowedOrigins(), host && `https://${host}`, host && `http://${host}`].filter(Boolean),
  );
  const site = env.publicSiteUrl();
  if (site) allowed.add(new URL(site).origin);
  if (!allowed.has(origin)) throw new AppError("FORBIDDEN", "Cross-origin request blocked.");
}

export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new AppError("BAD_REQUEST", "Request too large.");
  const text = await request.text();
  if (text.length > maxBytes) throw new AppError("BAD_REQUEST", "Request too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("BAD_REQUEST", "Invalid JSON");
  }
}

const baseHeaders = (rid: string) => ({ "x-request-id": rid, "cache-control": "no-store" });

export function jsonOk(data: Record<string, unknown>, rid: string, status = 200) {
  return Response.json({ ok: true, ...data }, { status, headers: baseHeaders(rid) });
}

/** Converts any thrown value into a safe JSON error response. */
export function jsonError(err: unknown, rid: string, route: string) {
  if (err instanceof AppError) {
    const headers: Record<string, string> = baseHeaders(rid);
    if (err.code === "RATE_LIMITED") headers["retry-after"] = "60";
    return Response.json(
      { ok: false, error: err.message, code: err.code, details: err.details },
      { status: err.status, headers },
    );
  }
  log("error", "unhandled route error", { route, rid, err });
  return Response.json(
    { ok: false, error: "Unexpected server error", code: "INTERNAL", requestId: rid },
    { status: 500, headers: baseHeaders(rid) },
  );
}

/** Wraps a public API handler with request id, error mapping and logging. */
export function publicHandler(
  route: string,
  fn: (ctx: { request: Request; rid: string; ip: string }) => Promise<Response>,
) {
  return async ({ request }: { request: Request }) => {
    const rid = requestId(request);
    try {
      return await fn({ request, rid, ip: clientIp(request) });
    } catch (err) {
      return jsonError(err, rid, route);
    }
  };
}
