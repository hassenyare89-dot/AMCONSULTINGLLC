import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/quote")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        return publicHandler("quote", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const { submitQuoteRequest } = await import("@/server/services/intake.server");
          return jsonOk(
            await submitQuoteRequest({ request, rid, ip }, await readJson(request)),
            rid,
          );
        })(ctx);
      },
    },
  },
});
