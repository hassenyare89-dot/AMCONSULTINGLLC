import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/reset")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        const auth = await import("@/server/auth/service.server");
        const cookie = await import("@/server/auth/cookie.server");
        return publicHandler("auth-reset", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          return jsonOk(
            await auth.requestPasswordReset(request, ip, await readJson(request, 4096)),
            rid,
          );
        })(ctx);
      },
    },
  },
});
