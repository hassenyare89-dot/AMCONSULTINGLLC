import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  Globe,
  LogOut,
  Menu,
  Radio,
  Scale,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rpc, useRpc } from "@/lib/admin/rpc";
import { AdminSessionProvider, type AdminSession } from "@/lib/admin/session";
import type { Permission } from "@/lib/shared/permissions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ErrorState, LoadingState, inputCls } from "./kit";
import { MfaGate } from "./MfaGate";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Gauge; perm: Permission };
export const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Overview", icon: Gauge, perm: "dashboard.view" },
  { to: "/admin/drivers", label: "Driver Management", icon: Users, perm: "drivers.read" },
  { to: "/admin/fleet", label: "Truck & Fleet", icon: Truck, perm: "fleet.read" },
  { to: "/admin/dispatch", label: "Dispatch Operations", icon: Radio, perm: "dispatch.read" },
  { to: "/admin/projects", label: "Loads & Projects", icon: FolderKanban, perm: "projects.read" },
  { to: "/admin/crm", label: "Customer CRM", icon: Building2, perm: "crm.read" },
  { to: "/admin/quotes", label: "Quotes & Estimates", icon: ClipboardList, perm: "quotes.read" },
  {
    to: "/admin/appointments",
    label: "Appointments",
    icon: CalendarClock,
    perm: "appointments.read",
  },
  { to: "/admin/documents", label: "Documents", icon: FileText, perm: "documents.read" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, perm: "dashboard.view" },
  { to: "/admin/cms", label: "Website CMS", icon: Globe, perm: "cms.edit" },
  { to: "/admin/reports", label: "Reports & Analytics", icon: BarChart3, perm: "reports.read" },
  { to: "/admin/users", label: "User Management", icon: UserCog, perm: "users.read" },
  { to: "/admin/compliance", label: "Compliance Records", icon: Scale, perm: "compliance.read" },
  { to: "/admin/audit", label: "Security & Audit Logs", icon: ScrollText, perm: "audit.read" },
  { to: "/admin/settings", label: "System Settings", icon: Settings, perm: "settings.read" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useRpc<AdminSession>("session.me", {}, { staleTime: 60_000, retry: false });

  const signOut = useCallback(
    async (reason?: "timeout") => {
      await rpc("session.event", {
        event: reason === "timeout" ? "session_timeout" : "logout",
      }).catch(() => {});
      await supabase.auth.signOut();
      qc.clear();
      navigate({ to: "/auth", search: reason ? { reason } : {} });
    },
    [navigate, qc],
  );

  if (me.isLoading) return <LoadingState label="Loading your workspace…" />;
  if (me.error) {
    if (me.error.code === "UNAUTHENTICATED") {
      void signOut();
      return <LoadingState label="Redirecting to sign in…" />;
    }
    return (
      <div className="p-8">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    );
  }
  const s = me.data!;
  if (!s.hasAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-8 w-8 text-navy" aria-hidden />
          <h1 className="mt-3 text-xl font-bold text-navy">
            {s.active ? "No access assigned" : "Account deactivated"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You're signed in as {s.email}, but this account{" "}
            {s.active
              ? "has no AMCMS role yet. Ask an administrator to grant access."
              : "has been deactivated."}
          </p>
          <Button className="mt-6" variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }
  if (s.mfaRequired && !s.mfaSatisfied) {
    return (
      <MfaGate email={s.email} onDone={() => qc.invalidateQueries()} onSignOut={() => signOut()} />
    );
  }
  return (
    <AdminSessionProvider value={s}>
      <Shell session={s} onSignOut={signOut}>
        {children}
      </Shell>
    </AdminSessionProvider>
  );
}

function useIdleTimeout(minutes: number, onIdle: () => void) {
  const last = useRef(Date.now());
  useEffect(() => {
    const bump = () => (last.current = Date.now());
    const events = ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - last.current > minutes * 60000) onIdle();
    }, 30000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(t);
    };
  }, [minutes, onIdle]);
}

function Shell({
  session,
  children,
  onSignOut,
}: {
  session: AdminSession;
  children: ReactNode;
  onSignOut: (r?: "timeout") => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setMobileOpen(false), [pathname]);
  useIdleTimeout(
    session.idleTimeoutMinutes || 30,
    useCallback(() => onSignOut("timeout"), [onSignOut]),
  );
  const nav = ADMIN_NAV.filter((n) => session.permissions.includes(n.perm));

  const sidebar = (
    <nav aria-label="AMCMS" className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-green font-bold text-navy-deep">
          AM
        </span>
        {!collapsed && <span className="text-sm font-semibold text-white">AMCMS</span>}
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {nav.map((n) => {
          const active =
            n.to === "/admin"
              ? pathname === "/admin" || pathname === "/admin/"
              : pathname.startsWith(n.to);
          return (
            <li key={n.to}>
              <Link
                to={n.to}
                aria-current={active ? "page" : undefined}
                title={collapsed ? n.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white focus-visible:focus-brand",
                  active && "bg-white/15 font-semibold text-white",
                )}
              >
                <n.icon className="h-4 w-4 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{n.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-white/10 p-2">
        <a
          href="/"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-xs text-white/60 hover:text-white focus-visible:focus-brand"
        >
          <Globe className="h-4 w-4" aria-hidden /> {!collapsed && "View website"}
        </a>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-[#F4F7FB]">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-navy focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 bg-navy-deep transition-[width] lg:block",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {sidebar}
      </aside>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-navy-deep">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-white/95 px-3 backdrop-blur sm:px-4">
          <button
            type="button"
            className="rounded-md p-2 lg:hidden focus-visible:focus-brand"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            className="hidden rounded-md p-2 lg:inline-flex focus-visible:focus-brand"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? (
              <Menu className="h-5 w-5" aria-hidden />
            ) : (
              <X className="h-5 w-5" aria-hidden />
            )}
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary focus-visible:focus-brand"
                  aria-label="Account menu"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-navy text-xs font-bold text-white">
                    {(session.fullName ?? session.email ?? "?").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="hidden max-w-40 truncate text-left sm:block">
                    <span className="block truncate font-medium text-navy">
                      {session.fullName ?? session.email}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {session.roleLabels.join(", ")}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{session.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin/account">My account & security</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSignOut()}>
                  <LogOut className="mr-2 h-4 w-4" aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setDeb(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const res = useRpc<{
    results: { type: string; id: string; title: string; subtitle?: string; href: string }[];
  }>("search.global", { q: deb }, { enabled: deb.length >= 2 });
  return (
    <Popover open={open && deb.length >= 2} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls="global-search-results"
            aria-label="Search drivers, trucks, dispatch, projects, customers, quotes"
            placeholder="Search everything…"
            className={cn(inputCls, "h-9 pl-8")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        id="global-search-results"
        align="start"
        className="w-[min(32rem,90vw)] p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {res.isLoading ? (
          <p className="p-3 text-sm text-muted-foreground">Searching…</p>
        ) : !res.data?.results.length ? (
          <p className="p-3 text-sm text-muted-foreground">No results.</p>
        ) : (
          <ul role="listbox" aria-label="Search results">
            {res.data.results.map((r) => (
              <li key={`${r.type}-${r.id}`} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full flex-col rounded px-3 py-2 text-left hover:bg-secondary focus-visible:focus-brand"
                  onClick={() => {
                    setOpen(false);
                    setQ("");
                    navigate({ href: r.href });
                  }}
                >
                  <span className="text-sm font-medium text-navy">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.type}
                    {r.subtitle ? ` · ${r.subtitle}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotificationBell() {
  const q = useRpc<{
    items: {
      id: string;
      title: string;
      body?: string;
      link?: string;
      created_at: string;
      read: boolean;
    }[];
    unread: number;
  }>("notifications.list", { limit: 10 }, { refetchInterval: 60_000 });
  const unread = q.data?.unread ?? 0;
  return (
    <Link
      to="/admin/notifications"
      className="relative rounded-md p-2 hover:bg-secondary focus-visible:focus-brand"
      aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
    >
      <Bell className="h-5 w-5 text-navy" aria-hidden />
      {unread > 0 && (
        <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
