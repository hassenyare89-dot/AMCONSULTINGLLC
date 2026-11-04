import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/mfa-enroll")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, jsonOk } = await import("@/server/http.server");
        const auth = await import("@/server/auth/service.server");
        const cookie = await import("@/server/auth/cookie.server");
        return publicHandler("auth-mfa-enroll", async ({ request, rid }) => {
          assertSameOrigin(request);
          return jsonOk(await auth.mfaEnroll(await cookie.requireClaims(request)), rid);
        })(ctx);
      },
    },
  },
});
