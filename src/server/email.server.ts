import { escapeHtml } from "@/lib/shared/sanitize";
import { db } from "./db.server";
import { env } from "./env.server";
import { log } from "./logger.server";

export type EmailResult = { status: "sent" | "failed" | "skipped"; id?: string };

/**
 * Transactional email via Resend. Every attempt (including "skipped" when no API key is
 * configured) is recorded in notification_delivery_events.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  template: string;
  relatedType?: string;
  relatedId?: string | null;
}): Promise<EmailResult> {
  const key = env.resendApiKey();
  let result: EmailResult = { status: "skipped" };
  let error: string | undefined;
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.mailFrom(),
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
          ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok) result = { status: "sent", id: json.id };
      else {
        result = { status: "failed" };
        error = `${res.status} ${json.message ?? ""}`.slice(0, 300);
      }
    } catch (e) {
      result = { status: "failed" };
      error = e instanceof Error ? e.message.slice(0, 300) : "send failed";
    }
  }
  if (result.status !== "sent")
    log(result.status === "failed" ? "error" : "warn", "email not sent", {
      template: opts.template,
      status: result.status,
      error,
    });
  const ins = await db()
    .from("notification_delivery_events")
    .insert({
      channel: "email",
      template: opts.template,
      recipient: opts.to.toLowerCase(),
      subject: opts.subject.slice(0, 200),
      status: result.status,
      provider_message_id: result.id ?? null,
      error: error ?? (result.status === "skipped" ? "RESEND_API_KEY not configured" : null),
      related_type: opts.relatedType ?? null,
      related_id: opts.relatedId ?? null,
    });
  if (ins.error) log("error", "delivery log write failed", { error: ins.error.message });
  return result;
}

const BRAND = { navy: "#072A6C", green: "#0DAA77", name: "AM Consulting LLC" };

export function siteUrl(request?: Request): string {
  const configured = env.publicSiteUrl();
  if (configured) return configured.replace(/\/$/, "");
  try {
    return request ? new URL(request.url).origin : "https://amconsultingllc.net";
  } catch {
    return "https://amconsultingllc.net";
  }
}

/** Shared branded email layout. All dynamic values must be escaped by the caller via `e()`. */
export function emailLayout(
  title: string,
  bodyHtml: string,
  opts: { footerNote?: string } = {},
): string {
  return `<!doctype html><html><body style="margin:0;background:#F4F7FB">
  <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1F2937">
    <div style="background:${BRAND.navy};padding:20px 24px"><span style="color:#fff;font-weight:700;font-size:18px">${BRAND.name}</span></div>
    <div style="padding:28px 24px">
      <h1 style="color:${BRAND.navy};font-size:20px;margin:0 0 16px">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:16px 24px;border-top:1px solid #E5E7EB;font-size:12px;color:#6B7280">
      ${opts.footerNote ? `<p style="margin:0 0 8px">${opts.footerNote}</p>` : ""}
      <p style="margin:0">${BRAND.name} · 5300 Memorial Dr. Unit 103C, Stone Mountain, GA 30083 · <a href="mailto:info@amconsultingllc.net" style="color:${BRAND.navy}">info@amconsultingllc.net</a></p>
    </div>
  </div></body></html>`;
}

export const e = escapeHtml;

export function emailTable(rows: [string, string | number | null | undefined][]): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#6B7280;width:170px;vertical-align:top">${e(k)}</td><td style="padding:6px 0"><strong>${e(String(v ?? "—") || "—")}</strong></td></tr>`,
    )
    .join("")}</table>`;
}

export function emailButton(label: string, href: string): string {
  return `<p style="margin:24px 0"><a href="${e(href)}" style="display:inline-block;background:${BRAND.green};color:#041A3D;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px">${e(label)}</a></p>`;
}
