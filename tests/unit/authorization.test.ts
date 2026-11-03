import { beforeEach, describe, expect, it, vi } from "vitest";

// Any database access is recorded; unauthorised calls must never reach it.
const dbCalls: string[] = [];
vi.mock("@/server/db.server", () => ({
  db: () => {
    dbCalls.push("db");
    throw new Error("DB_ACCESSED");
  },
  check: (r: { data: unknown }) => r.data,
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { OPS } from "@/server/rpc/registry.server";
import { assertStaff, requirePermission, type StaffContext } from "@/server/authz.server";
import { AppError } from "@/lib/shared/errors";
import { permissionsForRoles, type Permission } from "@/lib/shared/permissions";

const UUID = "00000000-0000-4000-8000-000000000001";
const ctx = (perms: Permission[] = [], extra: Partial<StaffContext> = {}): StaffContext => ({
  userId: UUID,
  email: "staff@example.com",
  roles: ["viewer"],
  permissions: new Set(perms),
  aal: "aal2",
  mfaSatisfied: true,
  active: true,
  requestId: "test",
  ipHash: null,
  ...extra,
});

// Plausible inputs so validation passes and the permission check is what stops the call.
const INPUT: Record<string, unknown> = {
  "resource.list": { resource: "leads" },
  "resource.get": { resource: "leads", id: UUID },
  "resource.create": { resource: "leads", values: { name: "x" } },
  "resource.update": { resource: "leads", id: UUID, values: { name: "y" } },
  "resource.archive": { resource: "leads", id: UUID },
  "resource.delete": { resource: "customer_contacts", id: UUID },
  "resource.options": { target: "drivers" },
  "resource.export": { resource: "leads" },
  "drivers.changeStatus": { id: UUID, status: "approved" },
  "drivers.addNote": { id: UUID, body: "n" },
  "drivers.assignReviewer": { id: UUID, reviewerId: null },
  "dispatch.calendar": { from: "2030-01-01T00:00:00Z", to: "2030-01-07T00:00:00Z" },
  "dispatch.workload": { from: "2030-01-01T00:00:00Z", to: "2030-01-07T00:00:00Z" },
  "dispatch.conflicts": {
    scheduled_start: "2030-01-01T00:00:00Z",
    scheduled_end: "2030-01-01T02:00:00Z",
  },
  "projects.addResource": { projectId: UUID, type: "driver", resourceId: UUID },
  "projects.removeResource": { id: UUID, projectId: UUID },
  "crm.detail": { leadId: UUID },
  "crm.convertLead": { leadId: UUID },
  "quotes.save": {
    title: "t",
    customer_name: "c",
    customer_email: "c@example.com",
    items: [{ description: "d", quantity: 1, unit: "hour", unit_price: 1 }],
  },
  "quotes.send": { id: UUID },
  "appointments.list": { from: "2030-01-01T00:00:00Z", to: "2030-01-07T00:00:00Z" },
  "appointments.update": { id: UUID, status: "confirmed" },
  "cms.section": { key: "home.hero" },
  "cms.saveDraft": { key: "home.hero", data: {} },
  "cms.publish": { key: "home.hero" },
  "cms.unpublish": { key: "home.hero" },
  "cms.revision": { key: "home.hero", revisionId: UUID },
  "cms.restore": { key: "home.hero", revisionId: UUID },
  "media.alt": { id: UUID, alt: "a" },
  "notifications.read": { ids: [] },
  "search.global": { q: "test" },
  "reports.summary": { from: "2030-01-01", to: "2030-01-31" },
  "reports.export": { from: "2030-01-01", to: "2030-01-31" },
  "users.invite": { email: "n@example.com", roles: ["viewer"] },
  "users.setRoles": { userId: UUID, roles: [] },
  "users.setActive": { userId: UUID, active: false },
  "compliance.lookup": { email: "x@example.com" },
  "settings.update": { key: "security.session", value: { idle_timeout_minutes: 30 } },
  "profile.update": { fullName: "Me" },
  "session.event": { event: "logout" },
};
const inputFor = (op: string) => INPUT[op] ?? { id: UUID };

beforeEach(() => {
  dbCalls.length = 0;
});

describe("server authorization", () => {
  const exempt = new Set(["session.me", "session.event"]);
  const ops = Object.keys(OPS).filter((o) => !exempt.has(o));

  it("registry covers the AMCMS modules", () => {
    expect(ops.length).toBeGreaterThan(55);
  });

  for (const op of ops) {
    it(`${op}: rejects a staff member with no permissions before touching the database`, async () => {
      await expect(OPS[op].handler(ctx([]), inputFor(op), { claims: {} })).rejects.toBeDefined();
      expect(dbCalls).toEqual([]);
    });
  }

  it("with the right permission the call proceeds to the data layer (test is meaningful)", async () => {
    await expect(
      OPS["resource.list"].handler(ctx(["crm.read"]), { resource: "leads" }, { claims: {} }),
    ).rejects.toThrow("DB_ACCESSED");
    expect(dbCalls.length).toBeGreaterThan(0);
  });

  it("read permission does not grant writes", async () => {
    await expect(
      OPS["resource.create"].handler(ctx(["crm.read"]), INPUT["resource.create"], { claims: {} }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      OPS["resource.update"].handler(
        ctx([...permissionsForRoles(["viewer"])]),
        { resource: "trucks", id: UUID, values: { make: "x" } },
        { claims: {} },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbCalls).toEqual([]);
  });

  it("only session bootstrap operations are reachable before MFA", () => {
    const preMfa = Object.entries(OPS)
      .filter(([, o]) => o.allowWithoutMfa)
      .map(([k]) => k)
      .sort();
    expect(preMfa).toEqual(["session.event", "session.me"]);
  });
});

describe("staff gate", () => {
  it("requires MFA (AAL2) for staff", () => {
    expect(() =>
      assertStaff(ctx(["dashboard.view"], { mfaSatisfied: false, aal: "aal1" })),
    ).toThrow(AppError);
    try {
      assertStaff(ctx([], { mfaSatisfied: false }));
    } catch (e) {
      expect((e as AppError).code).toBe("MFA_REQUIRED");
    }
  });
  it("blocks deactivated accounts and users without roles", () => {
    expect(() => assertStaff(ctx([], { active: false }))).toThrow(/deactivated/);
    expect(() => assertStaff(ctx([], { roles: [] }))).toThrow(/does not have access/);
  });
  it("requirePermission enforces both the gate and the permission", () => {
    expect(() => requirePermission(ctx(["crm.read"]), "crm.read")).not.toThrow();
    expect(() => requirePermission(ctx(["crm.read"]), "crm.write")).toThrow(/permission/);
    expect(() => requirePermission(ctx(["crm.read"], { mfaSatisfied: false }), "crm.read")).toThrow(
      /Multi-factor/,
    );
  });
});
