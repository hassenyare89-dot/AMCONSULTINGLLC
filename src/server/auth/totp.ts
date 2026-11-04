import { createHmac, randomBytes } from "node:crypto";

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) — compatible with standard authenticator apps. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code =
    ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const counterAt = (ms: number, step = 30) => Math.floor(ms / 1000 / step);

export function totp(secretB32: string, ms = Date.now()): string {
  return hotp(base32Decode(secretB32), counterAt(ms));
}

/**
 * Verifies a code within ±1 step of clock drift. Returns the matched counter (store it so the same
 * code can't be replayed) or null.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  lastCounter: number | null,
  ms = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const now = counterAt(ms);
  for (const c of [now, now - 1, now + 1]) {
    if (lastCounter !== null && c <= lastCounter) continue;
    if (hotp(secret, c) === code) return c;
  }
  return null;
}

export function otpauthUri(
  secretB32: string,
  account: string,
  issuer = "AM Consulting & Hauling",
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
