import { createFileRoute } from "@tanstack/react-router";
import { DriverStatusLookupSchema } from "@/lib/shared/validation";

export const Route = createFileRoute("/api/public/driver-status")({
  server: {
    handlers: {
      /** ?token=… (secure link, applicant-safe details) or ?id=…&email=… (status only). */
      GET: async (ctx) => {
        const { publicHandler, jsonOk } = await import("@/server/http.server");
        const { AppError } = await import("@/lib/shared/errors");
        return publicHandler("driver-status", async ({ request, rid, ip }) => {
          const url = new URL(request.url);
          const svc = await import("@/server/services/intake.server");
          const token = url.searchParams.get("token");
          if (token) return jsonOk(await svc.driverStatusByToken({ request, rid, ip }, token), rid);
          const parsed = DriverStatusLookupSchema.safeParse({
            id: url.searchParams.get("id"),
            email: url.searchParams.get("email"),
          });
          if (!parsed.success)
            throw new AppError("VALIDATION", "Enter your registration reference and email.");
          return jsonOk(
            await svc.driverStatusByIdEmail(
              { request, rid, ip },
              parsed.data.id,
              parsed.data.email,
            ),
            rid,
          );
        })(ctx);
      },
      /** Emails a fresh secure link. Body: { id, email } */
      POST: async (ctx) => {
        const { publicHandler, jsonOk, readJson, assertSameOrigin } =
          await import("@/server/http.server");
        const { AppError } = await import("@/lib/shared/errors");
        return publicHandler("driver-status-resend", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const parsed = DriverStatusLookupSchema.safeParse(await readJson(request));
          if (!parsed.success)
            throw new AppError("VALIDATION", "Enter your registration reference and email.");
          const svc = await import("@/server/services/intake.server");
          return jsonOk(
            await svc.resendDriverStatusLink(
              { request, rid, ip },
              parsed.data.id,
              parsed.data.email,
            ),
            rid,
          );
        })(ctx);
      },
    },
  },
});
