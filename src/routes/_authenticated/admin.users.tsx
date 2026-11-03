import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ConfirmButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  inputCls,
} from "@/components/admin/kit";
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Role,
} from "@/lib/shared/permissions";
import { fmtDateTime, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useAdminSession, useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/users")({ component: UsersPage });

function UsersPage() {
  const can = useCan();
  const me = useAdminSession();
  const q = useRpc<{ staff: any[]; assignableRoles: Role[] }>("users.list");
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  return (
    <>
      <PageHeader
        title="User Management"
        description="Only authorised administrators can invite staff. Public sign-up is disabled. Super Admin and Admin roles can only be granted by a Super Admin."
        actions={
          can("users.manage") && (
            <Button
              className="bg-navy text-white hover:bg-navy/90"
              onClick={() => setInviting(true)}
            >
              Invite staff member
            </Button>
          )
        }
      />
      <Panel>
        {q.isLoading ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data!.staff.length ? (
          <EmptyState title="No staff yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Staff accounts</caption>
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {["Name", "Email", "Roles", "Status", "Last sign-in", ""].map((h, i) => (
                    <th key={i} scope="col" className="px-2 py-2">
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.data!.staff.map((u) => (
                  <tr key={u.user_id} className="border-t border-border">
                    <td className="px-2 py-2 font-medium text-navy">
                      {u.full_name ?? "—"}
                      {u.user_id === me.userId && " (you)"}
                    </td>
                    <td className="px-2 py-2">{u.email}</td>
                    <td className="px-2 py-2">
                      {u.roles.map((r: Role) => ROLE_LABELS[r] ?? r).join(", ") || "—"}
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge value={u.active === false ? "inactive" : "active"} />
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {fmtDateTime(u.last_login_at)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {can("users.manage") && (
                        <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                          Manage
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="Role reference" className="mt-4">
        <ul className="grid gap-3 text-sm md:grid-cols-2">
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <li key={r}>
              <strong className="text-navy">{ROLE_LABELS[r]}</strong> — {ROLE_DESCRIPTIONS[r]}{" "}
              <span className="text-xs text-muted-foreground">
                ({ROLE_PERMISSIONS[r].length} permissions)
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <Sheet open={inviting} onOpenChange={setInviting}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {inviting && q.data && (
            <InviteForm roles={q.data.assignableRoles} onDone={() => setInviting(false)} />
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {editing && q.data && (
            <ManageUser
              user={editing}
              roles={q.data.assignableRoles}
              isSelf={editing.user_id === me.userId}
              onDone={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function RoleChecks({
  roles,
  value,
  onChange,
}: {
  roles: Role[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Roles</legend>
      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
        <label
          key={r}
          className={cn("flex items-start gap-2 text-sm", !roles.includes(r) && "opacity-50")}
        >
          <input
            type="checkbox"
            className="mt-1"
            disabled={!roles.includes(r)}
            checked={value.includes(r)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))
            }
          />
          <span>
            <strong>{ROLE_LABELS[r]}</strong>
            <span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function InviteForm({ roles, onDone }: { roles: Role[]; onDone: () => void }) {
  const [f, setF] = useState({ email: "", fullName: "", title: "", roles: [] as string[] });
  const invite = useRpcMutation("users.invite", {
    invalidate: ["users."],
    success: "Invitation sent",
    onSuccess: onDone,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        invite.mutate(f);
      }}
    >
      <SheetHeader>
        <SheetTitle>Invite staff member</SheetTitle>
        <SheetDescription>
          They'll receive an email to set a password, then must enrol two-step verification.
        </SheetDescription>
      </SheetHeader>
      {(["email", "fullName", "title"] as const).map((k) => (
        <div key={k}>
          <Label htmlFor={`inv-${k}`}>
            {{ email: "Email *", fullName: "Full name", title: "Job title" }[k]}
          </Label>
          <input
            id={`inv-${k}`}
            type={k === "email" ? "email" : "text"}
            required={k === "email"}
            className={cn(inputCls, "mt-1")}
            value={f[k]}
            onChange={(e) => setF({ ...f, [k]: e.target.value })}
          />
        </div>
      ))}
      <RoleChecks roles={roles} value={f.roles} onChange={(r) => setF({ ...f, roles: r })} />
      {invite.error && (
        <p role="alert" className="text-sm text-destructive">
          {invite.error.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={invite.isPending || !f.roles.length}
        className="bg-navy text-white hover:bg-navy/90"
      >
        Send invitation
      </Button>
    </form>
  );
}

function ManageUser({
  user,
  roles,
  isSelf,
  onDone,
}: {
  user: any;
  roles: Role[];
  isSelf: boolean;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(user.roles);
  const setRoles = useRpcMutation("users.setRoles", {
    invalidate: ["users."],
    success: "Roles updated",
    onSuccess: onDone,
  });
  const setActive = useRpcMutation("users.setActive", {
    invalidate: ["users."],
    success: "Account updated",
    onSuccess: onDone,
  });
  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle>{user.full_name ?? user.email}</SheetTitle>
        <SheetDescription>{user.email}</SheetDescription>
      </SheetHeader>
      <RoleChecks roles={roles} value={selected} onChange={setSelected} />
      {setRoles.error && (
        <p role="alert" className="text-sm text-destructive">
          {setRoles.error.message}
        </p>
      )}
      <Button
        onClick={() => setRoles.mutate({ userId: user.user_id, roles: selected })}
        disabled={setRoles.isPending}
      >
        Save roles
      </Button>
      {!isSelf && (
        <div className="border-t pt-4">
          {user.active === false ? (
            <Button
              variant="outline"
              onClick={() => setActive.mutate({ userId: user.user_id, active: true })}
            >
              Reactivate account
            </Button>
          ) : (
            <ConfirmButton
              variant="destructive"
              title="Deactivate this account?"
              description="They are signed out and can no longer access AMCMS. Records they created are kept."
              confirmLabel="Deactivate"
              onConfirm={() => setActive.mutateAsync({ userId: user.user_id, active: false })}
            >
              Deactivate account
            </ConfirmButton>
          )}
          {setActive.error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {setActive.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
