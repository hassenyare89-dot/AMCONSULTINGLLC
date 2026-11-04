import { z } from "zod";
import { AppError } from "@/lib/shared/errors";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_ENTITY_TYPES,
  DOCUMENT_SENSITIVITY,
} from "@/lib/shared/domain";
import { audit } from "../audit.server";
import { actorOf, can, requirePermission, type StaffContext } from "../authz.server";
import { check, db } from "../db.server";
import { sha256Hex } from "../crypto.server";

// ---- content sniffing -------------------------------------------------------------------
type Kind = { mime: string; ext: string };
const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, len: number) =>
  String.fromCharCode(...b.slice(from, from + len));

/** Identifies the real file type from magic bytes; the browser-declared type is never trusted. */
export function sniff(b: Uint8Array): Kind | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mime: "image/png", ext: "png" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (brand === "avif" || brand === "avis") return { mime: "image/avif", ext: "avif" };
    if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "dash"].includes(brand))
      return { mime: "video/mp4", ext: "mp4" };
  }
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "video/webm", ext: "webm" };
  if (ascii(b, 0, 4) === "glTF") return { mime: "model/gltf-binary", ext: "glb" };
  if (ascii(b, 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return { mime: "application/zip", ext: "zip" };
  return null;
}

function isPlainText(b: Uint8Array) {
  const n = Math.min(b.length, 8192);
  for (let i = 0; i < n; i++) if (b[i] === 0) return false;
  return true;
}

const MEDIA_LIMITS: Record<string, { kind: "image" | "video" | "model"; max: number }> = {
  "image/jpeg": { kind: "image", max: 10 * 1024 * 1024 },
  "image/png": { kind: "image", max: 10 * 1024 * 1024 },
  "image/webp": { kind: "image", max: 10 * 1024 * 1024 },
  "image/avif": { kind: "image", max: 10 * 1024 * 1024 },
  "video/mp4": { kind: "video", max: 100 * 1024 * 1024 },
  "video/webm": { kind: "video", max: 100 * 1024 * 1024 },
  "model/gltf-binary": { kind: "model", max: 30 * 1024 * 1024 },
};

const DOC_MAX = 25 * 1024 * 1024;

export function classifyMedia(bytes: Uint8Array) {
  const k = sniff(bytes);
  const limit = k && MEDIA_LIMITS[k.mime];
  if (!k || !limit)
    throw new AppError(
      "VALIDATION",
      "Unsupported file. Use JPEG, PNG, WebP, AVIF, MP4, WebM, or GLB.",
    );
  if (bytes.byteLength > limit.max)
    throw new AppError(
      "VALIDATION",
      `File too large (max ${Math.round(limit.max / 1048576)} MB for ${limit.kind}).`,
    );
  return { ...k, kind: limit.kind };
}

export function classifyDocument(bytes: Uint8Array, filename: string) {
  if (bytes.byteLength > DOC_MAX) throw new AppError("VALIDATION", "File too large (max 25 MB).");
  const k = sniff(bytes);
  const lower = filename.toLowerCase();
  if (
    k?.mime === "application/pdf" ||
    k?.mime === "image/jpeg" ||
    k?.mime === "image/png" ||
    k?.mime === "image/webp"
  )
    return k;
  if (k?.mime === "application/zip") {
    if (lower.endsWith(".docx"))
      return {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ext: "docx",
      };
    if (lower.endsWith(".xlsx"))
      return {
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ext: "xlsx",
      };
  }
  if (!k && isPlainText(bytes)) {
    if (lower.endsWith(".csv")) return { mime: "text/csv", ext: "csv" };
    if (lower.endsWith(".txt")) return { mime: "text/plain", ext: "txt" };
  }
  throw new AppError(
    "VALIDATION",
    "Unsupported document. Use PDF, JPEG, PNG, WebP, DOCX, XLSX, CSV, or TXT.",
  );
}

const safeName = (n: string) =>
  n
    .replace(/[^\w.-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120) || "file";

// ---- media library ------------------------------------------------------------------------
export async function uploadMedia(ctx: StaffContext, file: File, alt: string) {
  requirePermission(ctx, "media.write");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const k = classifyMedia(bytes);
  const sha = await sha256Hex(bytes);
  const path = `${k.kind}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${k.ext}`;
  const up = await db()
    .storage.from("media")
    .upload(path, bytes, { contentType: k.mime, cacheControl: "31536000", upsert: false });
  if (up.error)
    throw new AppError("INTERNAL", "Upload failed. Is the 'media' storage bucket configured?");
  const publicUrl = db().storage.from("media").getPublicUrl(path).data.publicUrl;
  const row = check(
    await db()
      .from("media_assets")
      .insert({
        storage_path: path,
        public_url: publicUrl,
        filename: safeName(file.name),
        content_type: k.mime,
        size_bytes: bytes.byteLength,
        kind: k.kind,
        alt_text: alt.slice(0, 300) || null,
        sha256: sha,
        uploaded_by: ctx.userId,
      })
      .select("id,public_url,kind,filename")
      .single(),
    "Saving media",
  );
  await audit(
    actorOf(ctx),
    "media.upload",
    "media_asset",
    (row as { id: string }).id,
    `Uploaded ${k.kind} ${safeName(file.name)}`,
  );
  return { media: row };
}

// ---- documents ----------------------------------------------------------------------------
const cat = DOCUMENT_CATEGORIES.map((c) => c.value) as [string, ...string[]];
const ent = DOCUMENT_ENTITY_TYPES.map((c) => c.value) as [string, ...string[]];
const sens = DOCUMENT_SENSITIVITY.map((c) => c.value) as [string, ...string[]];

export const DocumentMeta = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  category: z.enum(cat),
  entityType: z.enum(ent).default("company"),
  entityId: z.string().uuid().optional().or(z.literal("")),
  sensitivity: z.enum(sens).default("internal"),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  retainUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  previousVersionId: z.string().uuid().optional().or(z.literal("")),
});

function assertSensitivityAccess(ctx: StaffContext, sensitivity: string) {
  if (sensitivity === "restricted" && !can(ctx, "documents.restricted"))
    throw new AppError("FORBIDDEN", "Restricted documents require additional permission.");
}

export async function uploadDocument(ctx: StaffContext, file: File, metaRaw: unknown) {
  requirePermission(ctx, "documents.write");
  const meta = DocumentMeta.parse(metaRaw);
  assertSensitivityAccess(ctx, meta.sensitivity);
  if (meta.entityType !== "company" && !meta.entityId)
    throw new AppError("VALIDATION", "Choose the record this document belongs to.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const k = classifyDocument(bytes, file.name);
  const sha = await sha256Hex(bytes);
  let version = 1;
  if (meta.previousVersionId) {
    const prev = await db()
      .from("documents")
      .select("id,version,sensitivity")
      .eq("id", meta.previousVersionId)
      .maybeSingle();
    if (!prev.data) throw new AppError("NOT_FOUND", "Previous version not found.");
    assertSensitivityAccess(ctx, prev.data.sensitivity);
    version = prev.data.version + 1;
  }
  const path = `${meta.entityType}/${meta.entityId || "general"}/${crypto.randomUUID()}.${k.ext}`;
  const up = await db()
    .storage.from("documents")
    .upload(path, bytes, { contentType: k.mime, upsert: false });
  if (up.error)
    throw new AppError(
      "INTERNAL",
      "Upload failed. Is the private 'documents' storage bucket configured?",
    );
  const row = check(
    await db()
      .from("documents")
      .insert({
        title: meta.title,
        category: meta.category,
        entity_type: meta.entityType,
        entity_id: meta.entityId || null,
        sensitivity: meta.sensitivity,
        storage_path: path,
        filename: safeName(file.name),
        content_type: k.mime,
        size_bytes: bytes.byteLength,
        sha256: sha,
        version,
        previous_version_id: meta.previousVersionId || null,
        expires_on: meta.expiresOn || null,
        retain_until: meta.retainUntil || null,
        uploaded_by: ctx.userId,
      })
      .select("id")
      .single(),
    "Saving document",
  ) as { id: string };
  if (meta.previousVersionId)
    await db().from("documents").update({ is_current: false }).eq("id", meta.previousVersionId);
  await audit(
    actorOf(ctx),
    "document.upload",
    "document",
    row.id,
    `Uploaded ${meta.category} document “${meta.title}” v${version}`,
    {
      sensitivity: meta.sensitivity,
      entity_type: meta.entityType,
      entity_id: meta.entityId || null,
    },
  );
  return { id: row.id, version };
}

export async function listDocuments(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "documents.read");
  const p = z
    .object({
      entityType: z.string().optional().default(""),
      entityId: z.string().optional().default(""),
      category: z.string().optional().default(""),
      includeHistory: z.boolean().optional().default(false),
      includeArchived: z.boolean().optional().default(false),
      search: z.string().max(100).optional().default(""),
    })
    .parse(input ?? {});
  let q = db()
    .from("documents")
    .select(
      "id,title,category,entity_type,entity_id,sensitivity,filename,content_type,size_bytes,version,previous_version_id,is_current,expires_on,retain_until,scan_status,uploaded_by,archived_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (p.entityType) q = q.eq("entity_type", p.entityType);
  if (p.entityId) q = q.eq("entity_id", p.entityId);
  if (p.category) q = q.eq("category", p.category);
  if (!p.includeHistory) q = q.eq("is_current", true);
  if (!p.includeArchived) q = q.is("archived_at", null);
  if (!can(ctx, "documents.restricted")) q = q.neq("sensitivity", "restricted");
  const s = p.search.replace(/[,()%*]/g, " ").trim();
  if (s) q = q.or(`title.ilike.%${s}%,filename.ilike.%${s}%`);
  return { documents: check(await q, "Loading documents") ?? [] };
}

/** Issues a 60-second signed URL after permission checks; every download is audited. */
export async function documentDownloadUrl(ctx: StaffContext, id: string) {
  requirePermission(ctx, "documents.read");
  const { data } = await db()
    .from("documents")
    .select("id,title,storage_path,sensitivity,filename,scan_status")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new AppError("NOT_FOUND", "Document not found.");
  assertSensitivityAccess(ctx, data.sensitivity);
  if (data.scan_status === "infected")
    throw new AppError(
      "FORBIDDEN",
      "This file was flagged by malware scanning and cannot be downloaded.",
    );
  const signed = await db()
    .storage.from("documents")
    .createSignedUrl(data.storage_path, 60, { download: data.filename });
  if (signed.error || !signed.data)
    throw new AppError("INTERNAL", "Could not create download link.");
  await audit(actorOf(ctx), "document.download", "document", id, `Downloaded “${data.title}”`, {
    sensitivity: data.sensitivity,
  });
  return { url: signed.data.signedUrl };
}

export async function archiveDocument(ctx: StaffContext, id: string) {
  requirePermission(ctx, "documents.write");
  const { data } = await db()
    .from("documents")
    .select("id,title,sensitivity,retain_until")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new AppError("NOT_FOUND", "Document not found.");
  assertSensitivityAccess(ctx, data.sensitivity);
  check(
    await db().from("documents").update({ archived_at: new Date().toISOString() }).eq("id", id),
    "Archiving",
  );
  await audit(actorOf(ctx), "document.archive", "document", id, `Archived “${data.title}”`);
  return { ok: true };
}
