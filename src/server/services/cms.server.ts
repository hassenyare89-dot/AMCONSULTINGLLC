import { z } from "zod";
import { AppError } from "@/lib/shared/errors";
import {
  CMS_SECTIONS,
  cmsSectionSchema,
  getCmsSection,
  richTextFieldNames,
} from "@/lib/shared/cms-schema";
import { sanitizeHtml } from "@/lib/shared/sanitize";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/content/defaults";
import { audit } from "../audit.server";
import { actorOf, requirePermission, type StaffContext } from "../authz.server";
import { check, db } from "../db.server";
import { log } from "../logger.server";

// ---- public read ----------------------------------------------------------------------
let cache: { at: number; content: SiteContent; faqs: FaqPublic[] } | null = null;
const TTL_MS = 30_000;
export type FaqPublic = { id: string; question: string; answer: string; category: string };

function merge<T>(defaults: T, published: unknown): T {
  if (!published || typeof published !== "object") return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, v] of Object.entries(published as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    // Empty strings for media/url fields mean "use default asset".
    if (v === "" && typeof out[k] === "string") continue;
    out[k] = v;
  }
  return out as T;
}

/** Publishes due scheduled sections (lazy, on read; also run by the maintenance cron). */
export async function publishDueSections() {
  const { data } = await db()
    .from("content_sections")
    .select("key,draft,scheduled_at")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());
  for (const s of data ?? []) {
    await db()
      .from("content_sections")
      .update({
        published: s.draft,
        status: "published",
        published_at: new Date().toISOString(),
        scheduled_at: null,
      })
      .eq("key", s.key);
    await db()
      .from("content_revisions")
      .insert({ section_key: s.key, data: s.draft, action: "publish" });
    await db()
      .from("publishing_events")
      .insert({ section_key: s.key, action: "scheduled_publish" });
  }
  return (data ?? []).length;
}

export async function getPublicSiteContent(): Promise<{ content: SiteContent; faqs: FaqPublic[] }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const content = structuredClone(DEFAULT_CONTENT) as SiteContent;
  let faqs: FaqPublic[] = [];
  try {
    if ((await publishDueSections()) > 0) cache = null;
    const [sections, faqRes] = await Promise.all([
      db().from("content_sections").select("key,published").not("published", "is", null),
      db()
        .from("faq_entries")
        .select("id,question,answer,category,sort_order")
        .eq("published", true)
        .order("sort_order")
        .limit(200),
    ]);
    for (const row of (sections.data ?? []) as { key: string; published: unknown }[]) {
      const def = getCmsSection(row.key);
      if (!def || !(row.key in content)) continue;
      const parsed = cmsSectionSchema(def).safeParse(row.published);
      if (!parsed.success) {
        log("warn", "published CMS content failed validation; using defaults", { key: row.key });
        continue;
      }
      const data = parsed.data as Record<string, unknown>;
      for (const f of richTextFieldNames(def))
        if (typeof data[f] === "string") data[f] = sanitizeHtml(data[f] as string);
      (content as Record<string, unknown>)[row.key] = merge(
        (content as Record<string, unknown>)[row.key],
        data,
      );
    }
    faqs = (faqRes.data ?? []) as FaqPublic[];
  } catch (err) {
    // Database not configured / unavailable: serve defaults so the public site keeps working.
    log("warn", "CMS read failed; serving default content", { err });
  }
  cache = { at: Date.now(), content, faqs };
  return cache;
}

export function invalidateContentCache() {
  cache = null;
}

// ---- admin ----------------------------------------------------------------------------
export async function listSections(ctx: StaffContext) {
  requirePermission(ctx, "cms.edit");
  const { data } = await db()
    .from("content_sections")
    .select("key,status,scheduled_at,published_at,updated_at,updated_by");
  const byKey = new Map((data ?? []).map((r: { key: string }) => [r.key, r]));
  return {
    sections: CMS_SECTIONS.map((s) => ({
      page: s.page,
      title: s.title,
      description: s.description,
      ...((byKey.get(s.key) as object | undefined) ?? { status: "default" }),
      key: s.key,
    })),
  };
}

export async function getSection(ctx: StaffContext, key: string) {
  requirePermission(ctx, "cms.edit");
  const def = getCmsSection(key);
  if (!def) throw new AppError("NOT_FOUND", "Unknown content section.");
  const [row, revisions] = await Promise.all([
    db().from("content_sections").select("*").eq("key", key).maybeSingle(),
    db()
      .from("content_revisions")
      .select("id,action,created_by,created_at")
      .eq("section_key", key)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const defaults = (DEFAULT_CONTENT as Record<string, unknown>)[key];
  return {
    key,
    defaults,
    draft: row.data?.draft && Object.keys(row.data.draft).length ? row.data.draft : defaults,
    published: row.data?.published ?? null,
    status: row.data?.status ?? "default",
    scheduledAt: row.data?.scheduled_at ?? null,
    publishedAt: row.data?.published_at ?? null,
    revisions: revisions.data ?? [],
  };
}

function cleanSection(key: string, data: unknown) {
  const def = getCmsSection(key);
  if (!def) throw new AppError("NOT_FOUND", "Unknown content section.");
  const parsed = cmsSectionSchema(def).safeParse(data);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new AppError("VALIDATION", `${i?.path.join(".")}: ${i?.message}`);
  }
  const out = parsed.data as Record<string, unknown>;
  for (const f of richTextFieldNames(def))
    if (typeof out[f] === "string") out[f] = sanitizeHtml(out[f] as string);
  if (
    key === "home.hero" &&
    out.headlineAccent &&
    out.headline &&
    !String(out.headline).includes(String(out.headlineAccent))
  ) {
    throw new AppError("VALIDATION", "The highlighted text must appear in the headline.");
  }
  return { def, data: out };
}

export const SaveSectionInput = z.object({ key: z.string(), data: z.unknown() });

export async function saveDraft(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "cms.edit");
  const p = SaveSectionInput.parse(input);
  const { def, data } = cleanSection(p.key, p.data);
  const existing = await db()
    .from("content_sections")
    .select("status,published")
    .eq("key", p.key)
    .maybeSingle();
  const status = existing.data?.published ? "changes_pending" : "draft";
  check(
    await db().from("content_sections").upsert(
      {
        key: p.key,
        page: def.page,
        title: def.title,
        draft: data,
        status,
        scheduled_at: null,
        updated_by: ctx.userId,
      },
      { onConflict: "key" },
    ),
    "Saving draft",
  );
  await db()
    .from("content_revisions")
    .insert({ section_key: p.key, data, action: "save", created_by: ctx.userId });
  await audit(
    actorOf(ctx),
    "cms.save_draft",
    "content_section",
    p.key,
    `Saved draft of ${def.title}`,
  );
  return { ok: true, status };
}

export async function publishSection(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "cms.publish");
  const p = z
    .object({
      key: z.string(),
      data: z.unknown().optional(),
      scheduleAt: z.string().datetime().optional(),
    })
    .parse(input);
  if (p.data !== undefined) await saveDraft(ctx, { key: p.key, data: p.data });
  const row = await db()
    .from("content_sections")
    .select("draft,title")
    .eq("key", p.key)
    .maybeSingle();
  if (!row.data) throw new AppError("VALIDATION", "Save a draft first.");
  const { data } = cleanSection(p.key, row.data.draft);
  if (p.scheduleAt) {
    if (new Date(p.scheduleAt).getTime() <= Date.now())
      throw new AppError("VALIDATION", "Schedule time must be in the future.");
    check(
      await db()
        .from("content_sections")
        .update({ status: "scheduled", scheduled_at: p.scheduleAt })
        .eq("key", p.key),
      "Scheduling",
    );
    await db()
      .from("content_revisions")
      .insert({ section_key: p.key, data, action: "schedule", created_by: ctx.userId });
    await db()
      .from("publishing_events")
      .insert({ section_key: p.key, action: "schedule", actor_id: ctx.userId });
    await audit(
      actorOf(ctx),
      "cms.schedule",
      "content_section",
      p.key,
      `Scheduled ${row.data.title} for ${p.scheduleAt}`,
    );
    return { ok: true, status: "scheduled" };
  }
  check(
    await db()
      .from("content_sections")
      .update({
        published: data,
        status: "published",
        published_at: new Date().toISOString(),
        published_by: ctx.userId,
        scheduled_at: null,
      })
      .eq("key", p.key),
    "Publishing",
  );
  await db()
    .from("content_revisions")
    .insert({ section_key: p.key, data, action: "publish", created_by: ctx.userId });
  await db()
    .from("publishing_events")
    .insert({ section_key: p.key, action: "publish", actor_id: ctx.userId });
  await audit(actorOf(ctx), "cms.publish", "content_section", p.key, `Published ${row.data.title}`);
  invalidateContentCache();
  return { ok: true, status: "published" };
}

export async function unpublishSection(ctx: StaffContext, key: string) {
  requirePermission(ctx, "cms.publish");
  check(
    await db()
      .from("content_sections")
      .update({ published: null, status: "draft", scheduled_at: null })
      .eq("key", key),
    "Unpublishing",
  );
  await db()
    .from("publishing_events")
    .insert({ section_key: key, action: "unpublish", actor_id: ctx.userId });
  await audit(
    actorOf(ctx),
    "cms.unpublish",
    "content_section",
    key,
    `Reverted ${key} to default content`,
  );
  invalidateContentCache();
  return { ok: true };
}

export async function restoreRevision(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "cms.edit");
  const p = z.object({ key: z.string(), revisionId: z.string().uuid() }).parse(input);
  const rev = await db()
    .from("content_revisions")
    .select("data,created_at")
    .eq("id", p.revisionId)
    .eq("section_key", p.key)
    .maybeSingle();
  if (!rev.data) throw new AppError("NOT_FOUND", "Revision not found.");
  await saveDraft(ctx, { key: p.key, data: rev.data.data });
  await db()
    .from("content_revisions")
    .insert({ section_key: p.key, data: rev.data.data, action: "restore", created_by: ctx.userId });
  await audit(
    actorOf(ctx),
    "cms.restore",
    "content_section",
    p.key,
    `Restored revision from ${rev.data.created_at} into draft`,
  );
  return { ok: true };
}

export async function getRevision(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "cms.edit");
  const p = z.object({ key: z.string(), revisionId: z.string().uuid() }).parse(input);
  const rev = await db()
    .from("content_revisions")
    .select("id,data,action,created_at")
    .eq("id", p.revisionId)
    .eq("section_key", p.key)
    .maybeSingle();
  if (!rev.data) throw new AppError("NOT_FOUND", "Revision not found.");
  return { revision: rev.data };
}

// ---- media ----------------------------------------------------------------------------
export async function listMedia(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "cms.edit");
  const p = z
    .object({ kind: z.enum(["image", "video", "model", ""]).optional().default("") })
    .parse(input ?? {});
  let q = db()
    .from("media_assets")
    .select("id,public_url,filename,content_type,size_bytes,kind,alt_text,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (p.kind) q = q.eq("kind", p.kind);
  return { media: (await q).data ?? [] };
}

export async function updateMediaAlt(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "media.write");
  const p = z.object({ id: z.string().uuid(), alt: z.string().trim().max(300) }).parse(input);
  check(
    await db().from("media_assets").update({ alt_text: p.alt }).eq("id", p.id),
    "Updating media",
  );
  return { ok: true };
}

export async function deleteMedia(ctx: StaffContext, id: string) {
  requirePermission(ctx, "media.write");
  const { data } = await db()
    .from("media_assets")
    .select("storage_path,public_url,filename")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new AppError("NOT_FOUND", "Media not found.");
  const sections = (await db().from("content_sections").select("key,draft,published")).data ?? [];
  const user = sections.find((s: { draft: unknown; published: unknown }) =>
    JSON.stringify([s.draft, s.published]).includes(data.public_url),
  );
  if (user)
    throw new AppError("CONFLICT", `This file is used by “${user.key}”. Replace it there first.`);
  await db().storage.from("media").remove([data.storage_path]);
  check(await db().from("media_assets").delete().eq("id", id), "Deleting media");
  await audit(actorOf(ctx), "media.delete", "media_asset", id, `Deleted media ${data.filename}`);
  return { ok: true };
}
