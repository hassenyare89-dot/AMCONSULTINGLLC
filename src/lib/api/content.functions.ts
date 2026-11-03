import { createServerFn } from "@tanstack/react-start";

/** Public, unauthenticated read of published website content (falls back to defaults). */
export const getSiteContent = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicSiteContent } = await import("@/server/services/cms.server");
  return getPublicSiteContent();
});
