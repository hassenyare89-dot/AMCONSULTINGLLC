import { createFileRoute } from "@tanstack/react-router";

/**
 * Private documents. Only reachable with a short-lived HMAC-signed link issued by
 * documents.download (which checks permissions and sensitivity, and writes the audit log).
 */
export const Route = createFileRoute("/files/documents/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const storage = await import("@/server/storage.server");
        const rel = (params as { _splat?: string })._splat ?? "";
        const q = new URL(request.url).searchParams;
        const filename = q.get("dl");
        const denied = () =>
          new Response("This download link is invalid or has expired.", {
            status: 403,
            headers: { "cache-control": "no-store" },
          });
        let ok = false;
        try {
          ok = storage.verifyDocumentSignature(rel, q.get("exp"), filename, q.get("sig"));
        } catch {
          ok = false;
        }
        if (!ok) return denied();
        const bytes = await storage.readObject("documents", rel).catch(() => null);
        if (!bytes)
          return new Response("Not found", {
            status: 404,
            headers: { "cache-control": "no-store" },
          });
        const safe = (filename ?? "download").replace(/[^\w.-]+/g, "_").slice(0, 120) || "download";
        return new Response(bytes as BodyInit, {
          headers: {
            "content-type": storage.mimeFor(rel),
            "content-disposition": `attachment; filename="${safe}"`,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
          },
        });
      },
    },
  },
});
