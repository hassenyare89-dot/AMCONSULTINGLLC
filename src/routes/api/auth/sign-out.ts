import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/sign-out")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        const auth = await import("@/server/auth/service.server");
        const cookie = await import("@/server/auth/cookie.server");
        return publicHandler("auth-sign-out", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const body = (await readJson(request, 1024).catch(() => ({}))) as { reason?: unknown };
          const event = body?.reason === "timeout" ? "session_timeout" : "logout";
          const token = cookie.readSessionToken(request);
          if (token) {
            const claims = await auth.verifySession(token);
            await auth.revokeSession(token);
            if (claims) {
              const { loginEvent } = await import("@/server/audit.server");
              const { hashIp } = await import("@/server/crypto.server");
              await loginEvent({
                userId: claims.sub,
                email: claims.email,
                event,
                ipHash: await hashIp(ip),
              });
            }
          }
          const res = jsonOk({}, rid);
          res.headers.append("set-cookie", cookie.clearSessionCookie(request));
          return res;
        })(ctx);
      },
    },
  },
});
