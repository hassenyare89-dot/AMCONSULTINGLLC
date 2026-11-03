import type { Permission } from "@/lib/shared/permissions";
import { db } from "./db.server";
import { emailLayout, emailTable, sendEmail, siteUrl, e } from "./email.server";
import { env } from "./env.server";
import { log } from "./logger.server";
import { getSetting } from "./settings.server";

type Channel = "leads" | "drivers" | "quotes" | "appointments";

/** In-app notification for everyone holding `permission`, plus internal email to configured recipients. */
export async function notifyStaff(opts: {
  permission: Permission;
  channel?: Channel;
  type: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
  emailRows?: [string, string | number | null | undefined][];
  replyTo?: string;
  relatedType?: string;
  relatedId?: string | null;
  request?: Request;
}) {
  const ins = await db()
    .from("notifications")
    .insert({
      audience_permission: opts.permission,
      type: opts.type,
      title: opts.title.slice(0, 200),
      body: opts.body?.slice(0, 1000) ?? null,
      link: opts.link ?? null,
      dedupe_key: opts.dedupeKey ?? null,
    });
  if (ins.error && ins.error.code !== "23505")
    log("error", "notification insert failed", { error: ins.error.message });
  if (!opts.channel) return;
  const recipients = await getSetting("notifications.recipients");
  const list = recipients[opts.channel]?.length ? recipients[opts.channel] : [env.leadRecipient()];
  const link = opts.link ? `${siteUrl(opts.request)}${opts.link}` : null;
  const html = emailLayout(
    e(opts.title),
    `${opts.body ? `<p style="color:#4B5563">${e(opts.body)}</p>` : ""}${opts.emailRows ? emailTable(opts.emailRows) : ""}${
      link
        ? `<p style="margin-top:20px"><a href="${e(link)}" style="color:#072A6C">Open in AMCMS</a> (sign-in required)</p>`
        : ""
    }`,
  );
  await Promise.all(
    list.slice(0, 10).map((to) =>
      sendEmail({
        to,
        subject: opts.title,
        html,
        replyTo: opts.replyTo,
        template: `internal.${opts.type}`,
        relatedType: opts.relatedType,
        relatedId: opts.relatedId,
      }),
    ),
  );
}

export async function notifyUser(
  userId: string,
  n: { type: string; title: string; body?: string; link?: string; dedupeKey?: string },
) {
  const ins = await db()
    .from("notifications")
    .insert({
      user_id: userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      dedupe_key: n.dedupeKey ?? null,
    });
  if (ins.error && ins.error.code !== "23505")
    log("error", "notification insert failed", { error: ins.error.message });
}
