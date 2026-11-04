import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Server-function middleware: resolves the HttpOnly session cookie to the signed-in user.
 * Browser server-function calls are same-origin fetches, so the cookie is sent automatically.
 */
export const requireSession = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const { requireClaims } = await import("@/server/auth/cookie.server");
  const { AppError, encodeError } = await import("@/lib/shared/errors");
  let claims;
  try {
    claims = await requireClaims(request);
  } catch (err) {
    // Encode so the client sees code UNAUTHENTICATED and routes to sign-in.
    throw new Error(
      encodeError(
        err instanceof AppError ? err : new AppError("UNAUTHENTICATED", "Please sign in."),
      ),
    );
  }
  return next({ context: { userId: claims.sub, claims } });
});
