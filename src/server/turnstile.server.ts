import { AppError } from "@/lib/shared/errors";
import { env } from "./env.server";

/** Optional Cloudflare Turnstile verification. Enabled only when TURNSTILE_SECRET_KEY is set. */
export async function verifyTurnstile(token: string | undefined, ip: string) {
  const secret = env.turnstileSecret();
  if (!secret) return;
  if (!token) throw new AppError("VALIDATION", "Please complete the verification challenge.");
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip !== "unknown") body.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean };
  if (!json.success) throw new AppError("VALIDATION", "Verification failed. Please try again.");
}

/** Honeypot + time trap. Returns true when the submission looks automated (silently accept). */
export function looksLikeBot(input: { website?: string; ts: number }): boolean {
  if (input.website && input.website.length > 0) return true;
  const elapsed = Date.now() - input.ts;
  return elapsed < 2000 || elapsed > 1000 * 60 * 60 * 6;
}
