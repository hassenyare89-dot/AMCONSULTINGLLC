import { postJson } from "@/components/site/forms";

/**
 * Browser side of the built-in authentication. The session lives in an HttpOnly cookie set by
 * /api/auth/*, so no token is ever readable by page scripts.
 */
export type AuthSession = {
  user: { id: string; email: string };
  aal: "aal1" | "aal2";
  mfaEnabled: boolean;
};

export async function getSession(): Promise<AuthSession | null> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    // Always read the body so the request completes (an unread 401 body stays open in Chrome).
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; session?: AuthSession };
    return res.ok && json.ok && json.session ? json.session : null;
  } catch {
    return null;
  }
}

export const signIn = (email: string, password: string) =>
  postJson<{ mfaEnabled: boolean }>("/api/auth/sign-in", { email, password });

export const signOut = (reason?: string) =>
  postJson("/api/auth/sign-out", { reason }).catch(() => undefined);

export const mfaEnroll = () =>
  postJson<{ secret: string; uri: string; qrDataUrl: string }>("/api/auth/mfa-enroll", {});

export const mfaVerify = (code: string) => postJson("/api/auth/mfa-verify", { code });

export const changePassword = (currentPassword: string, newPassword: string) =>
  postJson("/api/auth/password", { currentPassword, newPassword });

export const requestPasswordReset = (email: string) =>
  postJson<{ message: string }>("/api/auth/reset", { email });

export const completeToken = (token: string, password: string) =>
  postJson<{ email: string }>("/api/auth/complete", { token, password });
