import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/appointment-manage")({
  server: {
    handlers: {
      GET: async (ctx) => {
        const { publicHandler, jsonOk } = await import("@/server/http.server");
        return publicHandler("appointment-manage", async ({ request, rid, ip }) => {
          const token = new URL(request.url).searchParams.get("token") ?? "";
          const { appointmentByToken } = await import("@/server/services/intake.server");
          return jsonOk(await appointmentByToken({ request, rid, ip }, token), rid);
        })(ctx);
      },
      POST: async (ctx) => {
        const { publicHandler, jsonOk, readJson, assertSameOrigin } =
          await import("@/server/http.server");
        return publicHandler("appointment-cancel", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const body = (await readJson(request)) as { token?: string };
          const { cancelAppointmentByToken } = await import("@/server/services/intake.server");
          return jsonOk(
            await cancelAppointmentByToken({ request, rid, ip }, String(body.token ?? "")),
            rid,
          );
        })(ctx);
      },
    },
  },
});
