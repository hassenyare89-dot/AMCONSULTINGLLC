import { createFileRoute } from "@tanstack/react-router";

/** Liveness/readiness probe for Docker and uptime monitors. Reveals nothing beyond up/down. */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const headers = { "cache-control": "no-store" };
        try {
          const { query } = await import("@/server/pg/pool.server");
          await query("SELECT 1");
          return Response.json({ ok: true }, { headers });
        } catch {
          return Response.json({ ok: false }, { status: 503, headers });
        }
      },
    },
  },
});
