import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/driver")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        return publicHandler("driver", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const { submitDriverRegistration } = await import("@/server/services/intake.server");
          return jsonOk(
            await submitDriverRegistration({ request, rid, ip }, await readJson(request)),
            rid,
          );
        })(ctx);
      },
    },
  },
});
