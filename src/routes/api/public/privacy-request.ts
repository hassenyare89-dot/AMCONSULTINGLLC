import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/privacy-request")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        return publicHandler("privacy-request", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const { submitPrivacyRequest } = await import("@/server/services/intake.server");
          return jsonOk(
            await submitPrivacyRequest({ request, rid, ip }, await readJson(request)),
            rid,
          );
        })(ctx);
      },
    },
  },
});
