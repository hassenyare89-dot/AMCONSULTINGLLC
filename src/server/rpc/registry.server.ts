import { z } from "zod";
import { AppError } from "@/lib/shared/errors";
import type { StaffContext } from "../authz.server";
import * as resources from "../services/resources.server";
import * as drivers from "../services/drivers.server";
import * as quotes from "../services/quotes.server";
import * as cms from "../services/cms.server";
import * as files from "../services/files.server";
import * as ops from "../services/operations.server";
import * as admin from "../services/admin.server";
import { sessionInfo } from "./session.server";

type Handler = (
  ctx: StaffContext,
  input: unknown,
  extra: { claims: Record<string, unknown>; request?: Request },
) => Promise<unknown>;
type Op = { handler: Handler; allowWithoutMfa?: boolean; allowWithoutRole?: boolean };

const id = (input: unknown) => z.object({ id: z.string().uuid() }).parse(input).id;
const op = (handler: Handler, opts: Omit<Op, "handler"> = {}): Op => ({ handler, ...opts });

/**
 * Every operation's handler performs its own permission check via requirePermission(); the
 * dispatcher additionally enforces "active staff + MFA" for all ops not explicitly exempted.
 */
export const OPS: Record<string, Op> = {
  // session (usable before MFA so the UI can route the user to enrolment)
  "session.me": op((ctx, _i, { claims }) => sessionInfo(ctx, claims), {
    allowWithoutMfa: true,
    allowWithoutRole: true,
  }),
  "session.event": op((ctx, i) => admin.recordAuthEvent(ctx, i), {
    allowWithoutMfa: true,
    allowWithoutRole: true,
  }),
  "profile.update": op((ctx, i) => admin.updateOwnProfile(ctx, i)),

  // generic resources
  "resource.list": op((ctx, i) => resources.listResource(ctx, resources.ListInput.parse(i))),
  "resource.get": op((ctx, i) => {
    const p = z.object({ resource: z.string(), id: z.string().uuid() }).parse(i);
    return resources.getResourceRow(ctx, p.resource, p.id);
  }),
  "resource.create": op((ctx, i) => {
    const p = z
      .object({
        resource: z.string(),
        values: z.record(z.string(), z.unknown()),
        confirmDuplicate: z.boolean().optional(),
      })
      .parse(i);
    return resources.createResource(ctx, p.resource, p.values, {
      confirmDuplicate: p.confirmDuplicate,
    });
  }),
  "resource.update": op((ctx, i) => {
    const p = z
      .object({
        resource: z.string(),
        id: z.string().uuid(),
        values: z.record(z.string(), z.unknown()),
      })
      .parse(i);
    return resources.updateResource(ctx, p.resource, p.id, p.values);
  }),
  "resource.archive": op((ctx, i) => {
    const p = z
      .object({ resource: z.string(), id: z.string().uuid(), restore: z.boolean().optional() })
      .parse(i);
    return resources.archiveResource(ctx, p.resource, p.id, p.restore);
  }),
  "resource.delete": op((ctx, i) => {
    const p = z.object({ resource: z.string(), id: z.string().uuid() }).parse(i);
    return resources.deleteResource(ctx, p.resource, p.id);
  }),
  "resource.options": op((ctx, i) => {
    const p = z
      .object({ target: z.string(), search: z.string().max(100).optional().default("") })
      .parse(i);
    return resources.refOptions(ctx, p.target, p.search).then((options) => ({ options }));
  }),
  "resource.export": op((ctx, i) => resources.exportResource(ctx, resources.ListInput.parse(i))),

  // drivers
  "drivers.applications": op((ctx, i) => drivers.listApplications(ctx, i)),
  "drivers.application": op((ctx, i) => drivers.getApplication(ctx, id(i))),
  "drivers.changeStatus": op((ctx, i) => drivers.changeApplicationStatus(ctx, i)),
  "drivers.addNote": op((ctx, i) => drivers.addApplicationNote(ctx, i)),
  "drivers.assignReviewer": op((ctx, i) => drivers.assignReviewer(ctx, i)),
  "drivers.export": op((ctx, i) => drivers.exportApplications(ctx, i)),

  // dispatch & projects
  "dispatch.calendar": op((ctx, i) => ops.dispatchCalendar(ctx, i)),
  "dispatch.workload": op((ctx, i) => ops.dispatchWorkload(ctx, i)),
  "dispatch.detail": op((ctx, i) => ops.dispatchDetail(ctx, id(i))),
  "dispatch.conflicts": op((ctx, i) => ops.checkDispatchConflicts(ctx, i)),
  "projects.detail": op((ctx, i) => ops.projectDetail(ctx, id(i))),
  "projects.addResource": op((ctx, i) => ops.addProjectResource(ctx, i)),
  "projects.removeResource": op((ctx, i) => ops.removeProjectResource(ctx, i)),

  // CRM
  "crm.pipeline": op((ctx, i) => ops.pipeline(ctx, i)),
  "crm.detail": op((ctx, i) => ops.leadDetail(ctx, i)),
  "crm.convertLead": op((ctx, i) => ops.convertLeadToCustomer(ctx, i)),

  // quotes
  "quotes.list": op((ctx, i) => quotes.listEstimates(ctx, i)),
  "quotes.get": op((ctx, i) => quotes.getEstimate(ctx, id(i))),
  "quotes.draftFromRequest": op((ctx, i) => quotes.draftFromRequest(ctx, id(i))),
  "quotes.save": op((ctx, i) => quotes.saveEstimate(ctx, i)),
  "quotes.send": op((ctx, i, { request }) => quotes.sendEstimate(ctx, i, request)),
  "quotes.revise": op((ctx, i) => quotes.reviseEstimate(ctx, id(i))),
  "quotes.approve": op((ctx, i) => quotes.approveEstimate(ctx, id(i))),
  "quotes.convert": op((ctx, i) => quotes.convertEstimateToProject(ctx, id(i))),

  // appointments
  "appointments.list": op((ctx, i) => ops.listAppointments(ctx, i)),
  "appointments.update": op((ctx, i) => ops.updateAppointment(ctx, i)),

  // documents
  "documents.list": op((ctx, i) => files.listDocuments(ctx, i)),
  "documents.download": op((ctx, i) => files.documentDownloadUrl(ctx, id(i))),
  "documents.archive": op((ctx, i) => files.archiveDocument(ctx, id(i))),

  // CMS
  "cms.sections": op((ctx) => cms.listSections(ctx)),
  "cms.section": op((ctx, i) => cms.getSection(ctx, z.object({ key: z.string() }).parse(i).key)),
  "cms.saveDraft": op((ctx, i) => cms.saveDraft(ctx, i)),
  "cms.publish": op((ctx, i) => cms.publishSection(ctx, i)),
  "cms.unpublish": op((ctx, i) =>
    cms.unpublishSection(ctx, z.object({ key: z.string() }).parse(i).key),
  ),
  "cms.revision": op((ctx, i) => cms.getRevision(ctx, i)),
  "cms.restore": op((ctx, i) => cms.restoreRevision(ctx, i)),
  "media.list": op((ctx, i) => cms.listMedia(ctx, i)),
  "media.alt": op((ctx, i) => cms.updateMediaAlt(ctx, i)),
  "media.delete": op((ctx, i) => cms.deleteMedia(ctx, id(i))),

  // admin
  "dashboard.overview": op((ctx) => admin.dashboardOverview(ctx)),
  "notifications.list": op((ctx, i) => admin.listNotifications(ctx, i)),
  "notifications.read": op((ctx, i) => admin.markNotificationsRead(ctx, i)),
  "search.global": op((ctx, i) => admin.globalSearch(ctx, i)),
  "reports.summary": op((ctx, i) => admin.reports(ctx, i)),
  "reports.export": op((ctx, i) => admin.exportReport(ctx, i)),
  "users.list": op((ctx) => admin.listStaff(ctx)),
  "users.invite": op((ctx, i, { request }) => admin.inviteStaff(ctx, i, request)),
  "users.setRoles": op((ctx, i) => admin.setStaffRoles(ctx, i)),
  "users.setActive": op((ctx, i) => admin.setStaffActive(ctx, i)),
  "audit.list": op((ctx, i) => admin.listAudit(ctx, i)),
  "audit.logins": op((ctx, i) => admin.listLoginEvents(ctx, i)),
  "notifications.deliveries": op((ctx, i) => admin.deliveryLog(ctx, i)),
  "compliance.consents": op((ctx, i) => admin.consentRecords(ctx, i)),
  "compliance.lookup": op((ctx, i) => admin.dataSubjectLookup(ctx, i)),
  "settings.get": op((ctx) => admin.getSettings(ctx)),
  "settings.update": op((ctx, i) => admin.updateSetting(ctx, i)),
};

export function getOp(name: string): Op {
  const o = Object.prototype.hasOwnProperty.call(OPS, name) ? OPS[name] : undefined;
  if (!o) throw new AppError("NOT_FOUND", "Unknown operation.");
  return o;
}
