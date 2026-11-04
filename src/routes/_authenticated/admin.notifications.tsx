import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel } from "@/components/admin/kit";
import { fmtDateTime, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const q = useRpc<{ items: any[]; unread: number }>("notifications.list", { limit: 100 });
  const read = useRpcMutation("notifications.read", { invalidate: ["notifications."] });
  const unreadIds = (q.data?.items ?? []).filter((n) => !n.read).map((n) => n.id);
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Alerts for new inquiries, registrations, quote responses, schedule changes, assignments, and upcoming expirations."
        actions={
          unreadIds.length > 0 && (
            <Button variant="outline" onClick={() => read.mutate({ ids: unreadIds })}>
              Mark all read
            </Button>
          )
        }
      />
      <Panel>
        {q.isLoading ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data!.items.length ? (
          <EmptyState title="You're all caught up" />
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.items.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "flex items-start justify-between gap-3 py-3",
                  !n.read && "font-medium",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-navy">
                    {!n.read && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-brand-green"
                        aria-label="Unread"
                      />
                    )}
                    {n.link ? (
                      <Link
                        to={n.link}
                        className="hover:underline"
                        onClick={() => !n.read && read.mutate({ ids: [n.id] })}
                      >
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </div>
                  {n.body && (
                    <p className="mt-0.5 line-clamp-2 text-sm font-normal text-muted-foreground">
                      {n.body}
                    </p>
                  )}
                  <p className="text-xs font-normal text-muted-foreground">
                    {fmtDateTime(n.created_at)}
                  </p>
                </div>
                {!n.read && (
                  <Button size="sm" variant="ghost" onClick={() => read.mutate({ ids: [n.id] })}>
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
