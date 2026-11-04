import { createFileRoute } from "@tanstack/react-router";

/** Public website media (images, video, 3D models) from the storage volume. */
export const Route = createFileRoute("/files/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const storage = await import("@/server/storage.server");
        const rel = (params as { _splat?: string })._splat ?? "";
        const bytes = await storage.readObject("media", rel).catch(() => null);
        if (!bytes) return new Response("Not found", { status: 404 });
        return new Response(bytes as BodyInit, {
          headers: {
            "content-type": storage.mimeFor(rel),
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
          },
        });
      },
    },
  },
});
