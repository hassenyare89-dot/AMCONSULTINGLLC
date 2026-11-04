import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Security headers applied to every SSR/API response.
 * CSP notes: TanStack Start injects inline hydration scripts, so script-src needs
 * 'unsafe-inline' until nonce support is wired (tracked in docs/06-SECURITY.md).
 * 'wasm-unsafe-eval' is not required. Lovable editor origins may frame previews only.
 */
function supabaseOrigin(): string {
  try {
    return process.env.SUPABASE_URL
      ? new URL(process.env.SUPABASE_URL).origin
      : "https://*.supabase.co";
  } catch {
    return "https://*.supabase.co";
  }
}

export function securityHeaders(https = true): Record<string, string> {
  const sb = supabaseOrigin();
  const sbWs = sb.replace(/^https:/, "wss:");
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: ${sb} https:`,
    `media-src 'self' blob: ${sb} https:`,
    `connect-src 'self' ${sb} ${sbWs} https://nominatim.openstreetmap.org https://challenges.cloudflare.com`,
    "frame-src https://www.google.com https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "form-action 'self'",
    "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  return {
    "content-security-policy": csp,
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
    "cross-origin-opener-policy": "same-origin-allow-popups",
    "x-frame-options": "SAMEORIGIN",
  };
}

function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const url = new URL(request.url);
  const https = url.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  for (const [k, v] of Object.entries(securityHeaders(https)))
    if (!headers.has(k)) headers.set(k, v);
  if (!https) headers.delete("strict-transport-security");
  const path = url.pathname;
  if (path.startsWith("/admin") || path.startsWith("/auth") || path.startsWith("/api/")) {
    headers.set("x-robots-tag", "noindex, nofollow");
    if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  }
  // x-frame-options can't express the Lovable allow-list; CSP frame-ancestors governs modern browsers.
  if (request.headers.get("sec-fetch-dest") === "iframe") headers.delete("x-frame-options");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        request,
      );
    }
  },
};
