import { createHash } from "node:crypto";

/**
 * AUTH_SECRET signs document URLs and encrypts MFA secrets. It must be a long random value in
 * production (generate with `openssl rand -base64 48`). A development fallback is used only
 * outside production so local runs work.
 */
export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production")
    throw new Error("AUTH_SECRET must be set (32+ characters) in production");
  return "dev-only-insecure-auth-secret-change-me-0000";
}

/** 32-byte key derived from AUTH_SECRET for a given purpose. */
export function deriveKey(purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${authSecret()}`).digest();
}
