import { createFileRoute } from "@tanstack/react-router";

/** Customer-facing estimate view/response via an unguessable, expiring token. */
export const Route = createFileRoute("/api/public/quote-view")({
  server: {
    handlers: {
      GET: async (ctx) => {
        const { publicHandler, jsonOk } = await import("@/server/http.server");
        return publicHandler("quote-view", async ({ request, rid, ip }) => {
          const token = new URL(request.url).searchParams.get("token") ?? "";
          const { publicEstimateByToken } = await import("@/server/services/quotes.server");
          return jsonOk(await publicEstimateByToken({ request, rid, ip }, token), rid);
        })(ctx);
      },
      POST: async (ctx) => {
        const { publicHandler, jsonOk, readJson, assertSameOrigin } =
          await import("@/server/http.server");
        return publicHandler("quote-respond", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const { respondToEstimate } = await import("@/server/services/quotes.server");
          return jsonOk(
            await respondToEstimate({ request, rid, ip }, await readJson(request)),
            rid,
          );
        })(ctx);
      },
    },
  },
});
