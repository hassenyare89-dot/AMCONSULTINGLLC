import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/password")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        const auth = await import("@/server/auth/service.server");
        const cookie = await import("@/server/auth/cookie.server");
        return publicHandler("auth-password", async ({ request, rid }) => {
          assertSameOrigin(request);
          const claims = await cookie.requireClaims(request);
          return jsonOk(await auth.changePassword(claims, await readJson(request, 4096)), rid);
        })(ctx);
      },
    },
  },
});
