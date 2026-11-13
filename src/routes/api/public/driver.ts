import { createFileRoute } from "@tanstack/react-router";

/** Driver registration: multipart form (fields + optional documents) or JSON (fields only). */
export const Route = createFileRoute("/api/public/driver")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const { publicHandler, assertSameOrigin, readJson, jsonOk } =
          await import("@/server/http.server");
        const { AppError } = await import("@/lib/shared/errors");
        return publicHandler("driver", async ({ request, rid, ip }) => {
          assertSameOrigin(request);
          const intake = await import("@/server/services/intake.server");
          const type = request.headers.get("content-type") ?? "";
          if (type.startsWith("multipart/form-data")) {
            // 5 documents x 10 MB + form fields.
            const len = Number(request.headers.get("content-length") ?? "0");
            if (len > 52 * 1024 * 1024)
              throw new AppError("BAD_REQUEST", "Attachments are too large (max 10 MB each).");
            let fd: FormData;
            try {
              fd = await request.formData();
            } catch {
              throw new AppError("BAD_REQUEST", "Invalid form submission.");
            }
            const { body, files } = intake.driverFormToInput(fd);
            return jsonOk(
              await intake.submitDriverRegistration({ request, rid, ip }, body, files),
              rid,
            );
          }
          return jsonOk(
            await intake.submitDriverRegistration({ request, rid, ip }, await readJson(request)),
            rid,
          );
        })(ctx);
      },
    },
  },
});
