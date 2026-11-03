/**
 * AMCMS role-based access control.
 *
 * This file is the single source of truth for which role can do what. It is imported by the
 * server (authoritative checks on every request) and by the client (to hide controls the user
 * cannot use — a convenience only, never a security control).
 */

export const ROLES = [
  "super_admin",
  "admin",
  "operations_manager",
  "dispatcher",
  "sales",
  "content_editor",
  "viewer",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  operations_manager: "Operations Manager",
  dispatcher: "Dispatcher",
  sales: "Sales / CRM",
  content_editor: "Content Editor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "Full system administration, including managing other administrators.",
  admin: "Business management and approved settings. Cannot grant Super Admin.",
  operations_manager: "Drivers, fleet, projects, dispatch, and operational documents.",
  dispatcher: "Dispatch schedules and jobs; may edit jobs assigned to them or unassigned.",
  sales: "Leads, customers, quotes, and appointments.",
  content_editor: "Website content, FAQs, and media.",
  viewer: "Read-only access to operational and sales records.",
};

export const PERMISSIONS = [
  "dashboard.view",
  "drivers.read",
  "drivers.write",
  "drivers.review",
  "drivers.export",
  "fleet.read",
  "fleet.write",
  "dispatch.read",
  "dispatch.write",
  "dispatch.manage_all",
  "projects.read",
  "projects.write",
  "crm.read",
  "crm.write",
  "crm.export",
  "quotes.read",
  "quotes.write",
  "quotes.send",
  "quotes.approve",
  "pricing.manage",
  "appointments.read",
  "appointments.write",
  "documents.read",
  "documents.write",
  "documents.restricted",
  "cms.edit",
  "cms.publish",
  "media.write",
  "reports.read",
  "reports.export",
  "users.read",
  "users.manage",
  "compliance.read",
  "compliance.write",
  "audit.read",
  "settings.read",
  "settings.write",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: ALL,
  admin: ALL,
  operations_manager: [
    "dashboard.view",
    "drivers.read",
    "drivers.write",
    "drivers.review",
    "drivers.export",
    "fleet.read",
    "fleet.write",
    "dispatch.read",
    "dispatch.write",
    "dispatch.manage_all",
    "projects.read",
    "projects.write",
    "crm.read",
    "quotes.read",
    "appointments.read",
    "documents.read",
    "documents.write",
    "documents.restricted",
    "reports.read",
    "reports.export",
  ],
  dispatcher: [
    "dashboard.view",
    "drivers.read",
    "fleet.read",
    "dispatch.read",
    "dispatch.write",
    "projects.read",
    "documents.read",
  ],
  sales: [
    "dashboard.view",
    "crm.read",
    "crm.write",
    "crm.export",
    "quotes.read",
    "quotes.write",
    "quotes.send",
    "appointments.read",
    "appointments.write",
    "projects.read",
    "documents.read",
    "reports.read",
  ],
  content_editor: ["dashboard.view", "cms.edit", "cms.publish", "media.write"],
  viewer: [
    "dashboard.view",
    "drivers.read",
    "fleet.read",
    "dispatch.read",
    "projects.read",
    "crm.read",
    "quotes.read",
    "appointments.read",
    "reports.read",
  ],
};

/** Roles that only a super admin may grant or revoke. */
export const PROTECTED_ROLES: readonly Role[] = ["super_admin", "admin"];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export function permissionsForRoles(roles: readonly string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) {
    if (!isRole(r)) continue;
    for (const p of ROLE_PERMISSIONS[r]) out.add(p);
  }
  return out;
}

export function hasPermission(roles: readonly string[], permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission);
}

/** Whether `actorRoles` may grant/revoke `role` on another user. */
export function canManageRole(actorRoles: readonly string[], role: Role): boolean {
  if (!hasPermission(actorRoles, "users.manage")) return false;
  if (PROTECTED_ROLES.includes(role)) return actorRoles.includes("super_admin");
  return true;
}
