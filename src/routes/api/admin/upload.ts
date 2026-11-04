import { createFileRoute } from "@tanstack/react-router";

/**
 * Authenticated multipart upload for the media library and private documents.
 * Auth: the staff session cookie (same as server functions), plus MFA and per-permission checks.
 */
export const Route = createFileRoute("/api/admin/upload")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, jsonOk } = await import("@/server/http.server");
        const { AppError } = await import("@/lib/shared/errors");
        return publicHandler("admin-upload", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const { authenticateRequest } = await import("@/server/rpc/session.server");
          const staff = await authenticateRequest(request, rid, ip);
          const len = Number(request.headers.get("content-length") ?? "0");
          if (len > 105 * 1024 * 1024) throw new AppError("BAD_REQUEST", "File too large.");
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File) || file.size === 0)
            throw new AppError("VALIDATION", "Choose a file to upload.");
          const target = String(form.get("target") ?? "");
          const files = await import("@/server/services/files.server");
          const { enforceRateLimit } = await import("@/server/ratelimit.server");
          await enforceRateLimit(`user:${staff.userId}:upload`, 30, 600);
          if (target === "media")
            return jsonOk(await files.uploadMedia(staff, file, String(form.get("alt") ?? "")), rid);
          if (target === "document") {
            const meta = JSON.parse(String(form.get("meta") ?? "{}"));
            return jsonOk(await files.uploadDocument(staff, file, meta), rid);
          }
          throw new AppError("BAD_REQUEST", "Unknown upload target.");
        })(ctx);
      },
    },
  },
});
