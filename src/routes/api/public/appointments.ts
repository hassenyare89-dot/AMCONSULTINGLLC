import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/appointments")({
  server: {
    handlers: {
      GET: async (ctx) => {
        const { publicHandler, jsonOk } = await import("@/server/http.server");
        const { AppError } = await import("@/lib/shared/errors");
        return publicHandler("appointment-slots", async ({ request, rid, ip }) => {
          const date = new URL(request.url).searchParams.get("date") ?? "";
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError("VALIDATION", "Choose a date");
          const { availableSlots } = await import("@/server/services/intake.server");
          return jsonOk(await availableSlots({ request, rid, ip }, date), rid);
        })(ctx);
      },
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        return publicHandler("appointment", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const { submitAppointment } = await import("@/server/services/intake.server");
          return jsonOk(
            await submitAppointment({ request, rid, ip }, await readJson(request)),
            rid,
          );
        })(ctx);
      },
    },
  },
});
