import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/sign-in")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        const auth = await import("@/server/auth/service.server");
        const cookie = await import("@/server/auth/cookie.server");
        return publicHandler("auth-sign-in", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const r = await auth.signIn(request, ip, await readJson(request, 4096));
          const res = jsonOk({ mfaEnabled: r.mfaEnabled }, rid);
          res.headers.append("set-cookie", cookie.sessionCookie(request, r.token));
          return res;
        })(ctx);
      },
    },
  },
});
