import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily maintenance (scheduled publishing, expiry reminders, quote expiry).
 * Call with: POST /api/cron/maintenance  Authorization: Bearer $CRON_SECRET
 * (Cloudflare Cron Trigger, GitHub Actions schedule, or any scheduler.)
 */
export const Route = createFileRoute("/api/cron/maintenance")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, jsonOk } = await import("@/server/http.server");
        const { AppError } = await import("@/lib/shared/errors");
        const { env } = await import("@/server/env.server");
        const { safeEqual } = await import("@/server/crypto.server");
        return publicHandler("cron-maintenance", async ({ request, rid }) => {
          const secret = env.cronSecret();
          if (!secret) throw new AppError("NOT_CONFIGURED", "CRON_SECRET is not configured.");
          const got = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
          if (!safeEqual(got, secret)) throw new AppError("UNAUTHENTICATED", "Unauthorized");
          const { runMaintenance } = await import("@/server/services/admin.server");
          return jsonOk(await runMaintenance(), rid);
        })(ctx);
      },
    },
  },
});
