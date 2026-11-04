import { createContext, useContext, type ReactNode } from "react";
import type { Permission } from "@/lib/shared/permissions";

export type AdminSession = {
  userId: string;
  email: string | null;
  fullName: string | null;
  roles: string[];
  roleLabels: string[];
  permissions: Permission[];
  aal: "aal1" | "aal2";
  mfaRequired: boolean;
  mfaSatisfied: boolean;
  active: boolean;
  hasAccess: boolean;
  idleTimeoutMinutes: number;
};

const Ctx = createContext<AdminSession | null>(null);
export const AdminSessionProvider = ({
  value,
  children,
}: {
  value: AdminSession;
  children: ReactNode;
}) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;

export function useAdminSession(): AdminSession {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminSession outside provider");
  return v;
}

/** UI-only permission check (the server enforces the real rule). */
export function useCan() {
  const s = useAdminSession();
  return (p: Permission) => s.permissions.includes(p);
}
