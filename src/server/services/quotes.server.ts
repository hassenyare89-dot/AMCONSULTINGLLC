import { z } from "zod";
import { AppError } from "@/lib/shared/errors";
import { ESTIMATE_STATUSES, type EstimateStatus } from "@/lib/shared/domain";
import { estimateTotals, formatMoney, lineTotal } from "@/lib/shared/quote-math";
import { sanitizeSearchTerm } from "@/lib/shared/resource-schema";
import { audit } from "../audit.server";
import { actorOf, requirePermission, type StaffContext } from "../authz.server";
import { check, db } from "../db.server";
import { hashIp, hashToken, randomToken } from "../crypto.server";
import { emailButton, emailLayout, emailTable, sendEmail, siteUrl, e } from "../email.server";
import { notifyStaff } from "../notify.server";
import { enforceRateLimit } from "../ratelimit.server";
import { getSetting } from "../settings.server";

const EST_COLS =
  "id,estimate_number,quote_request_id,customer_id,lead_id,title,customer_name,customer_email,customer_company,status,valid_until,terms,notes,subtotal,tax_rate,tax_amount,total,revision,sent_at,viewed_at,responded_at,customer_response_note,approved_at,approved_by,project_id,created_at,updated_at";

const ItemInput = z.object({
  description: z.string().trim().min(1, "Item description is required").max(300),
  quantity: z.coerce.number().positive("Quantity must be positive").max(100000),
  unit: z.string().trim().max(30).default("hour"),
  unit_price: z.coerce.number().min(0).max(1_000_000),
  pricing_rule_id: z.string().uuid().nullable().optional(),
});

export const EstimateInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Title is required").max(200),
  customer_name: z.string().trim().min(1, "Customer name is required").max(150),
  customer_email: z.string().trim().email("Valid customer email required").max(255),
  customer_company: z.string().trim().max(150).optional().nullable(),
  customer_id: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  quote_request_id: z.string().uuid().nullable().optional(),
  valid_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  tax_rate: z.coerce.number().min(0).max(0.5).default(0),
  terms: z.string().max(4000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  items: z.array(ItemInput).min(1, "Add at least one line item").max(50),
});

async function recordStatus(
  estimateId: string,
  from: string | null,
  to: string,
  actor: "staff" | "customer" | "system",
  userId: string | null,
  note?: string,
) {
  await db()
    .from("quote_status_history")
    .insert({
      estimate_id: estimateId,
      from_status: from,
      to_status: to,
      changed_by: userId,
      actor_type: actor,
      note: note ?? null,
    });
}

/** Marks estimates past valid_until as expired (lazy, on read). */
async function expireStale() {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db()
    .from("estimates")
    .select("id,status")
    .in("status", ["sent", "viewed"])
    .lt("valid_until", today)
    .limit(100);
  for (const r of data ?? []) {
    await db().from("estimates").update({ status: "expired" }).eq("id", r.id);
    await recordStatus(r.id, r.status, "expired", "system", null, "Validity period ended");
  }
}

export async function listEstimates(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "quotes.read");
  await expireStale();
  const p = z
    .object({
      status: z.string().optional().default(""),
      search: z.string().max(100).optional().default(""),
      page: z.number().int().min(1).default(1),
    })
    .parse(input ?? {});
  let q = db()
    .from("estimates")
    .select(EST_COLS, { count: "exact" })
    .order("created_at", { ascending: false });
  if (p.status) {
    if (!(ESTIMATE_STATUSES as readonly string[]).includes(p.status))
      throw new AppError("VALIDATION", "Invalid status");
    q = q.eq("status", p.status);
  }
  const s = sanitizeSearchTerm(p.search);
  if (s)
    q = q.or(
      `estimate_number.ilike.%${s}%,title.ilike.%${s}%,customer_name.ilike.%${s}%,customer_email.ilike.%${s}%,customer_company.ilike.%${s}%`,
    );
  const res = await q.range((p.page - 1) * 25, p.page * 25 - 1);
  return { rows: check(res, "Loading estimates") ?? [], total: res.count ?? 0 };
}

export async function getEstimate(ctx: StaffContext, id: string) {
  requirePermission(ctx, "quotes.read");
  const [est, items, history] = await Promise.all([
    db().from("estimates").select(EST_COLS).eq("id", id).maybeSingle(),
    db()
      .from("estimate_items")
      .select("id,description,quantity,unit,unit_price,line_total,pricing_rule_id,sort_order")
      .eq("estimate_id", id)
      .order("sort_order"),
    db()
      .from("quote_status_history")
      .select("id,from_status,to_status,note,actor_type,changed_by,created_at")
      .eq("estimate_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!est.data) throw new AppError("NOT_FOUND", "Estimate not found.");
  return { estimate: est.data, items: items.data ?? [], history: history.data ?? [] };
}

/** Prefills a draft from a public quote request. */
export async function draftFromRequest(ctx: StaffContext, requestId: string) {
  requirePermission(ctx, "quotes.write");
  const { data: qr } = await db()
    .from("quote_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!qr) throw new AppError("NOT_FOUND", "Quote request not found.");
  const defaults = await getSetting("quotes.defaults");
  const valid = new Date(Date.now() + defaults.valid_days * 86400000).toISOString().slice(0, 10);
  return {
    draft: {
      title: `${qr.service_type.replace(/-/g, " ")} — ${qr.pickup_location}`.slice(0, 200),
      customer_name: qr.name,
      customer_email: qr.email,
      customer_company: qr.company,
      lead_id: qr.lead_id,
      quote_request_id: qr.id,
      valid_until: valid,
      tax_rate: defaults.tax_rate,
      terms: defaults.terms,
      notes: [
        qr.details,
        qr.truck_count && `Trucks requested: ${qr.truck_count}`,
        qr.preferred_date && `Preferred date: ${qr.preferred_date}`,
      ]
        .filter(Boolean)
        .join("\n"),
      items: [],
    },
  };
}

export async function saveEstimate(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "quotes.write");
  const p = EstimateInput.parse(input);
  // Validate pricing-rule references are real & active (approved pricing only).
  const ruleIds = [...new Set(p.items.map((i) => i.pricing_rule_id).filter(Boolean) as string[])];
  if (ruleIds.length) {
    const { data } = await db().from("pricing_rules").select("id,active").in("id", ruleIds);
    if ((data ?? []).filter((r: { active: boolean }) => r.active).length !== ruleIds.length)
      throw new AppError("VALIDATION", "One or more pricing rules are inactive or missing.");
  }
  const totals = estimateTotals(p.items, p.tax_rate);
  const base = {
    title: p.title,
    customer_name: p.customer_name,
    customer_email: p.customer_email.toLowerCase(),
    customer_company: p.customer_company ?? null,
    customer_id: p.customer_id ?? null,
    lead_id: p.lead_id ?? null,
    quote_request_id: p.quote_request_id ?? null,
    valid_until: p.valid_until ?? null,
    tax_rate: p.tax_rate,
    terms: p.terms ?? null,
    notes: p.notes ?? null,
    ...totals,
  };
  let id = p.id;
  if (id) {
    const cur = await db().from("estimates").select("status").eq("id", id).maybeSingle();
    if (!cur.data) throw new AppError("NOT_FOUND", "Estimate not found.");
    if (cur.data.status !== "draft")
      throw new AppError("CONFLICT", "Only drafts can be edited. Create a revision first.");
    check(await db().from("estimates").update(base).eq("id", id), "Saving estimate");
    check(await db().from("estimate_items").delete().eq("estimate_id", id), "Saving items");
  } else {
    const created = check(
      await db()
        .from("estimates")
        .insert({ ...base, status: "draft", created_by: ctx.userId })
        .select("id")
        .single(),
      "Creating estimate",
    ) as { id: string };
    id = created.id;
    await recordStatus(id, null, "draft", "staff", ctx.userId);
    if (p.quote_request_id)
      await db()
        .from("quote_requests")
        .update({ status: "estimated" })
        .eq("id", p.quote_request_id);
  }
  check(
    await db()
      .from("estimate_items")
      .insert(
        p.items.map((it, i) => ({
          estimate_id: id,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          line_total: lineTotal(it),
          pricing_rule_id: it.pricing_rule_id ?? null,
          sort_order: i,
        })),
      ),
    "Saving items",
  );
  await audit(
    actorOf(ctx),
    p.id ? "estimate.update" : "estimate.create",
    "estimate",
    id!,
    `Saved draft estimate (${formatMoney(totals.total)})`,
    { total: totals.total, items: p.items.length },
  );
  return { id };
}

export async function sendEstimate(ctx: StaffContext, input: unknown, request?: Request) {
  requirePermission(ctx, "quotes.send");
  const { id, message } = z
    .object({ id: z.string().uuid(), message: z.string().max(2000).optional().default("") })
    .parse(input);
  const { estimate, items } = await getEstimate(ctx, id);
  if (!["draft", "sent", "viewed"].includes(estimate.status))
    throw new AppError(
      "CONFLICT",
      `A ${estimate.status} estimate can't be sent. Create a revision.`,
    );
  if (!items.length) throw new AppError("VALIDATION", "Add line items before sending.");
  const token = randomToken();
  const expires = new Date(Date.now() + 60 * 86400000).toISOString();
  check(
    await db()
      .from("estimates")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        public_token_hash: await hashToken(token),
        public_token_expires_at: expires,
      })
      .eq("id", id),
    "Sending",
  );
  if (estimate.status !== "sent")
    await recordStatus(id, estimate.status, "sent", "staff", ctx.userId);
  const link = `${siteUrl(request)}/quotes/view?token=${encodeURIComponent(token)}`;
  const res = await sendEmail({
    to: estimate.customer_email,
    subject: `Estimate ${estimate.estimate_number} from AM Consulting LLC`,
    template: "quote.sent",
    relatedType: "estimate",
    relatedId: id,
    html: emailLayout(
      `Your estimate ${e(estimate.estimate_number)}`,
      `<p style="color:#4B5563">Hi ${e(estimate.customer_name)}, please find your estimate for <strong>${e(estimate.title)}</strong>.</p>
       ${message ? `<p style="white-space:pre-wrap;color:#4B5563">${e(message)}</p>` : ""}
       ${emailTable([
         ["Total", formatMoney(estimate.total)],
         ["Valid until", estimate.valid_until ?? "—"],
       ])}
       ${emailButton("View estimate", link)}
       <p style="font-size:12px;color:#6B7280">Estimates are for planning purposes and are not binding until confirmed in a written agreement.</p>`,
    ),
  });
  await audit(
    actorOf(ctx),
    "estimate.send",
    "estimate",
    id,
    `Sent estimate ${estimate.estimate_number} to customer`,
    { email_status: res.status },
  );
  return { ok: true, emailStatus: res.status, link: res.status === "sent" ? undefined : link };
}

export async function reviseEstimate(ctx: StaffContext, id: string) {
  requirePermission(ctx, "quotes.write");
  const { estimate } = await getEstimate(ctx, id);
  if (estimate.status === "draft") return { ok: true };
  if (estimate.project_id)
    throw new AppError("CONFLICT", "This estimate has already been converted to a project.");
  check(
    await db()
      .from("estimates")
      .update({
        status: "draft",
        revision: estimate.revision + 1,
        public_token_hash: null,
        public_token_expires_at: null,
        approved_at: null,
        approved_by: null,
      })
      .eq("id", id),
    "Revising",
  );
  await recordStatus(
    id,
    estimate.status,
    "draft",
    "staff",
    ctx.userId,
    `Revision ${estimate.revision + 1}`,
  );
  await audit(
    actorOf(ctx),
    "estimate.revise",
    "estimate",
    id,
    `Opened revision ${estimate.revision + 1}`,
  );
  return { ok: true };
}

/** Internal approval of a customer-accepted estimate (required before conversion). */
export async function approveEstimate(ctx: StaffContext, id: string) {
  requirePermission(ctx, "quotes.approve");
  const { estimate } = await getEstimate(ctx, id);
  if (estimate.status !== "accepted")
    throw new AppError("CONFLICT", "Only customer-accepted estimates can be approved.");
  check(
    await db()
      .from("estimates")
      .update({ approved_at: new Date().toISOString(), approved_by: ctx.userId })
      .eq("id", id),
    "Approving",
  );
  await audit(
    actorOf(ctx),
    "estimate.approve",
    "estimate",
    id,
    `Approved accepted estimate ${estimate.estimate_number}`,
  );
  return { ok: true };
}

export async function convertEstimateToProject(ctx: StaffContext, id: string) {
  requirePermission(ctx, "quotes.approve");
  requirePermission(ctx, "projects.write");
  const { estimate } = await getEstimate(ctx, id);
  if (estimate.status !== "accepted" || !estimate.approved_at)
    throw new AppError("CONFLICT", "Approve the accepted estimate before converting it.");
  if (estimate.project_id) return { projectId: estimate.project_id };
  let customerId = estimate.customer_id as string | null;
  if (!customerId) {
    const existing = await db()
      .from("customers")
      .select("id")
      .ilike("email", estimate.customer_email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    customerId = existing.data?.id ?? null;
    if (!customerId) {
      const c = check(
        await db()
          .from("customers")
          .insert({
            name: estimate.customer_name,
            company: estimate.customer_company,
            email: estimate.customer_email,
            source: "quote_request",
          })
          .select("id")
          .single(),
        "Creating customer",
      ) as { id: string };
      customerId = c.id;
    }
  }
  const qr = estimate.quote_request_id
    ? (
        await db()
          .from("quote_requests")
          .select("pickup_location,service_type,preferred_date,truck_count,truck_type")
          .eq("id", estimate.quote_request_id)
          .maybeSingle()
      ).data
    : null;
  const proj = check(
    await db()
      .from("projects")
      .insert({
        name: estimate.title,
        customer_id: customerId,
        estimate_id: id,
        status: "planning",
        created_by: ctx.userId,
        address: qr?.pickup_location ?? null,
        service_type: qr?.service_type ?? null,
        start_date: qr?.preferred_date ?? null,
        truck_requirements: qr
          ? [qr.truck_count && `${qr.truck_count} trucks`, qr.truck_type]
              .filter(Boolean)
              .join(", ") || null
          : null,
        notes: `Created from estimate ${estimate.estimate_number} (${formatMoney(estimate.total)}).`,
      })
      .select("id,project_number")
      .single(),
    "Creating project",
  ) as { id: string; project_number: string };
  await db()
    .from("estimates")
    .update({ project_id: proj.id, customer_id: customerId })
    .eq("id", id);
  if (estimate.lead_id)
    await db()
      .from("leads")
      .update({ stage: "won", customer_id: customerId })
      .eq("id", estimate.lead_id);
  await audit(
    actorOf(ctx),
    "estimate.convert",
    "estimate",
    id,
    `Converted ${estimate.estimate_number} to project ${proj.project_number}`,
    { project_id: proj.id },
  );
  return { projectId: proj.id };
}

// ---- customer-facing ---------------------------------------------------------------
type PubCtx = { request: Request; ip: string; rid: string };

async function estimateForToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token))
    throw new AppError("NOT_FOUND", "This estimate link is invalid or has expired.");
  const { data } = await db()
    .from("estimates")
    .select(`${EST_COLS},public_token_expires_at`)
    .eq("public_token_hash", await hashToken(token))
    .maybeSingle();
  if (
    !data ||
    (data.public_token_expires_at && new Date(data.public_token_expires_at).getTime() < Date.now())
  ) {
    throw new AppError("NOT_FOUND", "This estimate link is invalid or has expired.");
  }
  return data;
}

export async function publicEstimateByToken(ctx: PubCtx, token: string) {
  await enforceRateLimit(`ip:${await hashIp(ctx.ip)}:qview`, 30, 60);
  const est = await estimateForToken(token);
  if (est.status === "sent") {
    await db()
      .from("estimates")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", est.id);
    await recordStatus(est.id, "sent", "viewed", "customer", null);
    est.status = "viewed";
  }
  const items =
    (
      await db()
        .from("estimate_items")
        .select("description,quantity,unit,unit_price,line_total")
        .eq("estimate_id", est.id)
        .order("sort_order")
    ).data ?? [];
  const expired = est.valid_until && est.valid_until < new Date().toISOString().slice(0, 10);
  return {
    estimate: {
      estimate_number: est.estimate_number,
      title: est.title,
      customer_name: est.customer_name,
      customer_company: est.customer_company,
      status: expired && ["sent", "viewed"].includes(est.status) ? "expired" : est.status,
      valid_until: est.valid_until,
      terms: est.terms,
      subtotal: est.subtotal,
      tax_rate: est.tax_rate,
      tax_amount: est.tax_amount,
      total: est.total,
      revision: est.revision,
      sent_at: est.sent_at,
    },
    items,
  };
}

export async function respondToEstimate(ctx: PubCtx, body: unknown) {
  await enforceRateLimit(`ip:${await hashIp(ctx.ip)}:qrespond`, 10, 600);
  const p = z
    .object({
      token: z.string(),
      action: z.enum(["accept", "decline"]),
      note: z.string().trim().max(1000).optional().default(""),
      name: z.string().trim().min(1, "Type your name to confirm").max(120),
    })
    .parse(body);
  const est = await estimateForToken(p.token);
  if (!["sent", "viewed"].includes(est.status))
    throw new AppError("CONFLICT", "This estimate can no longer be responded to online.");
  if (est.valid_until && est.valid_until < new Date().toISOString().slice(0, 10))
    throw new AppError(
      "CONFLICT",
      "This estimate has expired. Please contact us for an updated estimate.",
    );
  const to: EstimateStatus = p.action === "accept" ? "accepted" : "declined";
  check(
    await db()
      .from("estimates")
      .update({
        status: to,
        responded_at: new Date().toISOString(),
        customer_response_note: `${p.name}: ${p.note}`.slice(0, 1100),
      })
      .eq("id", est.id),
    "Recording response",
  );
  await recordStatus(est.id, est.status, to, "customer", null, `Responded by ${p.name}`);
  await db()
    .from("audit_logs")
    .insert({
      action: `estimate.customer_${p.action}`,
      entity_type: "estimate",
      entity_id: est.id,
      summary: `Customer ${to} estimate ${est.estimate_number} (signed as ${p.name.slice(0, 80)})`,
      ip_hash: await hashIp(ctx.ip),
      request_id: ctx.rid,
    });
  await notifyStaff({
    permission: "quotes.read",
    channel: "quotes",
    type: `quote.${to}`,
    title: `Estimate ${est.estimate_number} ${to} by customer`,
    body: p.note || undefined,
    link: `/admin/quotes?estimate=${est.id}`,
    emailRows: [
      ["Estimate", est.estimate_number],
      ["Customer", est.customer_name],
      ["Total", formatMoney(est.total)],
      ["Response", to],
      ["Signed as", p.name],
      ["Note", p.note],
    ],
    relatedType: "estimate",
    relatedId: est.id,
    request: ctx.request,
  });
  return {
    status: to,
    message:
      to === "accepted"
        ? "Thank you — we'll be in touch to confirm the details in writing."
        : "Thanks for letting us know.",
  };
}
