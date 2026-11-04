import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/** scrypt password hashing, stored as `scrypt$N$r$p$salt$hash` (base64url fields). */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 32;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: 128 * n * r * 2 };
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, opts, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(
    password,
    Buffer.from(salt, "base64url"),
    Number(n),
    Number(r),
    Number(p),
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Burns comparable CPU when an account doesn't exist, so response timing can't reveal valid emails. */
const DUMMY = ["scrypt", N, R, P, "A".repeat(22), "A".repeat(43)].join("$");
export async function verifyAgainstDummy(password: string): Promise<false> {
  await verifyPassword(password, DUMMY);
  return false;
}
