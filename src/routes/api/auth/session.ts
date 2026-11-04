import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async (ctx) => {
        const { publicHandler, jsonOk } = await import("@/server/http.server");
        const auth = await import("@/server/auth/service.server");
        const cookie = await import("@/server/auth/cookie.server");
        return publicHandler("auth-session", async ({ request, rid }) => {
          const claims = await cookie.requireClaims(request);
          return jsonOk({ session: await auth.sessionSummary(claims) }, rid);
        })(ctx);
      },
    },
  },
});
