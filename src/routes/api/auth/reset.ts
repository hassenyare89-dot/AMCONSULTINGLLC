import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/reset")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        return publicHandler("auth-reset", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const { requestPasswordReset } = await import("@/server/rpc/session.server");
          return jsonOk(
            await requestPasswordReset(request, ip, await readJson(request, 4096)),
            rid,
          );
        })(ctx);
      },
    },
  },
});
