import { describe, expect, it } from "vitest";
import {
  canManageRole,
  hasPermission,
  permissionsForRoles,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from "@/lib/shared/permissions";

describe("RBAC matrix", () => {
  it("every role maps only to known permissions", () => {
    for (const r of ROLES) for (const p of ROLE_PERMISSIONS[r]) expect(PERMISSIONS).toContain(p);
  });
  it("super admin and admin have every permission", () => {
    for (const p of PERMISSIONS) {
      expect(hasPermission(["super_admin"], p)).toBe(true);
      expect(hasPermission(["admin"], p)).toBe(true);
    }
  });
  it("viewer is read-only", () => {
    const perms = [...permissionsForRoles(["viewer"])];
    expect(perms.every((p) => p.endsWith(".read") || p === "dashboard.view")).toBe(true);
  });
  it("dispatcher cannot touch CRM, quotes, CMS or users", () => {
    for (const p of [
      "crm.read",
      "quotes.read",
      "cms.edit",
      "users.read",
      "settings.write",
    ] as const)
      expect(hasPermission(["dispatcher"], p)).toBe(false);
    expect(hasPermission(["dispatcher"], "dispatch.write")).toBe(true);
    expect(hasPermission(["dispatcher"], "dispatch.manage_all")).toBe(false);
  });
  it("content editor is limited to CMS and media", () => {
    expect([...permissionsForRoles(["content_editor"])].sort()).toEqual(
      ["cms.edit", "cms.publish", "dashboard.view", "media.write"].sort(),
    );
  });
  it("multiple roles combine", () => {
    const p = permissionsForRoles(["dispatcher", "sales"]);
    expect(p.has("dispatch.write") && p.has("crm.write")).toBe(true);
  });
  it("unknown roles grant nothing", () => {
    expect(permissionsForRoles(["root", "owner"]).size).toBe(0);
  });
  it("only super admins may grant protected roles", () => {
    expect(canManageRole(["admin"], "super_admin")).toBe(false);
    expect(canManageRole(["admin"], "admin")).toBe(false);
    expect(canManageRole(["admin"], "dispatcher")).toBe(true);
    expect(canManageRole(["super_admin"], "admin")).toBe(true);
    expect(canManageRole(["sales"], "viewer")).toBe(false);
  });
});
