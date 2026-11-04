import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/sign-in")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        return publicHandler("auth-sign-in", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const { staffSignIn } = await import("@/server/rpc/session.server");
          return jsonOk(
            { session: await staffSignIn(request, ip, await readJson(request, 4096)) },
            rid,
          );
        })(ctx);
      },
    },
  },
});
