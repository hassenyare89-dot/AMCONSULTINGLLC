import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/contact")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        return publicHandler("contact", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const { submitContact } = await import("@/server/services/intake.server");
          return jsonOk(await submitContact({ request, rid, ip }, await readJson(request)), rid);
        })(ctx);
      },
    },
  },
});
