import { AppError } from "@/lib/shared/errors";
import { verifySession, type SessionClaims } from "./service.server";

export const SESSION_COOKIE = "amcms_session";
const MAX_AGE = 12 * 60 * 60;

function isSecure(request: Request): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.NODE_ENV === "production") return true;
  const proto =
    request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return proto === "https";
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("=")) || null;
  }
  return null;
}

/** HttpOnly + SameSite=Lax: unreadable by scripts and not sent on cross-site POSTs (CSRF). */
export function sessionCookie(request: Request, token: string): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE}`,
    isSecure(request) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie(request: Request): string {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    isSecure(request) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** Resolves the request's session or throws UNAUTHENTICATED. */
export async function requireClaims(request: Request): Promise<SessionClaims> {
  const token = readSessionToken(request);
  const claims = token ? await verifySession(token) : null;
  if (!claims)
    throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  return claims;
}
