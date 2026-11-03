import { useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-navy">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  tone?: "default" | "warn";
}) {
  const body = (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm transition-colors h-full",
        tone === "warn" ? "border-amber-300" : "border-border",
        href && "hover:border-brand-green",
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold text-navy tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
  return href ? (
    <a href={href} className="block rounded-xl focus-visible:focus-brand">
      {body}
    </a>
  ) : (
    body
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  blue: "bg-blue-50 text-blue-800 border-blue-200",
  amber: "bg-amber-50 text-amber-900 border-amber-200",
  red: "bg-red-50 text-red-800 border-red-200",
  gray: "bg-slate-100 text-slate-700 border-slate-200",
  navy: "bg-navy text-white border-navy",
};
const STATUS_TONE: Record<string, keyof typeof TONES> = {
  new: "blue",
  reviewed: "amber",
  info_requested: "amber",
  approved: "green",
  rejected: "red",
  archived: "gray",
  active: "green",
  inactive: "gray",
  suspended: "red",
  available: "green",
  assigned: "blue",
  maintenance: "amber",
  out_of_service: "red",
  scheduled: "blue",
  in_progress: "amber",
  completed: "green",
  cancelled: "gray",
  on_hold: "amber",
  planning: "gray",
  contacted: "blue",
  qualified: "blue",
  proposal_sent: "amber",
  negotiation: "amber",
  won: "green",
  lost: "gray",
  draft: "gray",
  sent: "blue",
  viewed: "amber",
  accepted: "green",
  declined: "red",
  expired: "gray",
  requested: "amber",
  confirmed: "green",
  no_show: "red",
  received: "blue",
  verifying: "amber",
  denied: "red",
  open: "blue",
  done: "green",
  published: "green",
  changes_pending: "amber",
  default: "gray",
  low: "gray",
  normal: "blue",
  high: "amber",
  urgent: "red",
  restricted: "red",
  confidential: "amber",
  internal: "gray",
  skipped: "amber",
  failed: "red",
};

export function StatusBadge({
  value,
  label,
}: {
  value: string | null | undefined;
  label?: string;
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const tone = TONES[STATUS_TONE[value] ?? "gray"];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone,
      )}
    >
      {label ?? value.replace(/_/g, " ")}
    </span>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-medium text-navy">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: { message: string; code?: string } | null;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-10 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="mt-3 font-medium text-navy">
        {error?.code === "FORBIDDEN" ? "You don't have access to this" : "Couldn't load this"}
      </p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{error?.message}</p>
      {onRetry && error?.code !== "FORBIDDEN" && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function KeyValues({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {k}
          </dt>
          <dd className="mt-0.5 break-words text-foreground">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Button that asks for confirmation before running a (typically destructive) action. */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  variant = "outline",
  size = "sm",
  disabled,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<unknown>;
  variant?: "outline" | "destructive" | "default" | "ghost";
  size?: "sm" | "default";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await onConfirm();
                setOpen(false);
              }}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function Timeline({
  items,
}: {
  items: { id: string; title: ReactNode; meta?: ReactNode; body?: ReactNode }[];
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-4">
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span
            className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-green"
            aria-hidden
          />
          <div className="text-sm font-medium text-navy">{it.title}</div>
          {it.meta && <div className="text-xs text-muted-foreground">{it.meta}</div>}
          {it.body && (
            <div className="mt-1 whitespace-pre-wrap text-sm text-foreground">{it.body}</div>
          )}
        </li>
      ))}
    </ol>
  );
}

export const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
