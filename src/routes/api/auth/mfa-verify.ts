import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/mfa-verify")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        const auth = await import("@/server/auth/service.server");
        const cookie = await import("@/server/auth/cookie.server");
        return publicHandler("auth-mfa-verify", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const claims = await cookie.requireClaims(request);
          return jsonOk(
            await auth.mfaVerify(request, ip, claims, await readJson(request, 1024)),
            rid,
          );
        })(ctx);
      },
    },
  },
});
