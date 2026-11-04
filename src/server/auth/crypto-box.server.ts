import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { deriveKey } from "./secrets.server";

/** AES-256-GCM encryption for secrets stored in the database (MFA seeds). */
export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("mfa-secret"), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function open(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1") throw new Error("Unsupported sealed format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey("mfa-secret"),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
