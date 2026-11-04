import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/shared/errors";
import { authSecret } from "./auth/secrets.server";

/**
 * File storage on the local filesystem (a Docker volume in production).
 *   media/      public website assets, served at /files/media/<path>
 *   documents/  private; served only via short-lived HMAC-signed URLs at /files/documents/<path>
 */
export type Bucket = "media" | "documents";
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

function root(): string {
  return path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), ".storage"));
}

/** Resolves a storage path safely inside the bucket directory (no traversal). */
export function resolvePath(bucket: Bucket, rel: string): string {
  const segments = rel.split("/");
  if (
    !segments.length ||
    segments.length > 6 ||
    !segments.every((s) => SEGMENT.test(s) && s !== "." && s !== "..")
  ) {
    throw new AppError("BAD_REQUEST", "Invalid file path.");
  }
  const base = path.join(root(), bucket);
  const full = path.resolve(base, ...segments);
  if (!full.startsWith(base + path.sep)) throw new AppError("BAD_REQUEST", "Invalid file path.");
  return full;
}

export async function putObject(bucket: Bucket, rel: string, bytes: Uint8Array): Promise<void> {
  const full = resolvePath(bucket, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes, { flag: "wx", mode: 0o640 }); // wx: never overwrite
}

export async function readObject(bucket: Bucket, rel: string): Promise<Uint8Array | null> {
  try {
    const full = resolvePath(bucket, rel);
    const s = await stat(full);
    if (!s.isFile()) return null;
    return new Uint8Array(await readFile(full));
  } catch {
    return null;
  }
}

export async function removeObject(bucket: Bucket, rel: string): Promise<void> {
  await rm(resolvePath(bucket, rel), { force: true });
}

export function publicUrl(rel: string): string {
  return `/files/media/${rel}`;
}

function sign(rel: string, exp: number, filename: string): string {
  return createHmac("sha256", authSecret())
    .update(`documents|${rel}|${exp}|${filename}`)
    .digest("base64url");
}

/** Signed, expiring download URL for a private document. */
export function signedDocumentUrl(rel: string, seconds: number, filename: string): string {
  resolvePath("documents", rel);
  const exp = Math.floor(Date.now() / 1000) + seconds;
  const q = new URLSearchParams({ exp: String(exp), dl: filename, sig: sign(rel, exp, filename) });
  return `/files/documents/${rel}?${q}`;
}

export function verifyDocumentSignature(
  rel: string,
  exp: string | null,
  filename: string | null,
  sig: string | null,
): boolean {
  if (!exp || !sig || filename === null || !/^\d{1,12}$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(rel, Number(exp), filename));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
  glb: "model/gltf-binary",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
};
export const mimeFor = (rel: string) =>
  MIME[rel.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
