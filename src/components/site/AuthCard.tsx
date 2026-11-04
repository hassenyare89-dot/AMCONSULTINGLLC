import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-surface px-4 py-16"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2 text-navy">
          <ShieldCheck className="h-6 w-6 text-brand-green-ink" aria-hidden />
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        {children}
        <div className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">
            Back to website
          </Link>
        </div>
      </div>
    </main>
  );
}
