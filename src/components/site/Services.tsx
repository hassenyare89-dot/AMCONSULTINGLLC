import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  HardHat,
  PackageCheck,
  Route,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { SiteContent } from "@/lib/content/defaults";

const ICONS: Record<string, LucideIcon> = {
  "dump-truck-dispatching": Truck,
  "load-coordination": PackageCheck,
  "project-scheduling": CalendarClock,
  "hauling-logistics": Route,
  "transportation-consulting": ClipboardList,
  "contractor-support": HardHat,
};
export const serviceIcon = (slug: string) => ICONS[slug] ?? Truck;

export function Services({
  content,
  heading = true,
}: {
  content: SiteContent["services"];
  heading?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <section
      id="services"
      aria-labelledby="services-title"
      className="relative bg-background py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {heading && (
          <SectionHeader
            id="services-title"
            eyebrow="What we do"
            title="Dispatching, hauling & logistics support"
            subtitle={content.intro}
          />
        )}
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((s, i) => {
            const Icon = serviceIcon(s.slug);
            return (
              <motion.li
                key={s.slug}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-elevated)]"
              >
                <div
                  className="absolute inset-x-0 top-0 h-1 rounded-t-2xl opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: "var(--gradient-accent)" }}
                  aria-hidden
                />
                <div
                  className="grid h-12 w-12 place-items-center rounded-xl text-white"
                  style={{ background: "var(--gradient-hero)" }}
                  aria-hidden
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-navy">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {s.summary}
                </p>
                <Link
                  to="/services/$slug"
                  params={{ slug: s.slug }}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-navy underline decoration-brand-green decoration-2 underline-offset-4 focus-visible:focus-brand rounded after:absolute after:inset-0"
                  aria-label={`Learn more about ${s.title}`}
                >
                  Learn more <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  light = false,
  id,
  as = "h2",
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  light?: boolean;
  id?: string;
  as?: "h1" | "h2";
}) {
  const reduce = useReducedMotion();
  const H = as;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="max-w-2xl"
    >
      <span
        className={`text-xs font-bold uppercase tracking-[0.18em] ${light ? "text-brand-green-soft" : "text-brand-green-ink"}`}
      >
        {eyebrow}
      </span>
      <H
        id={id}
        className={`mt-3 text-3xl font-extrabold leading-[1.05] sm:text-4xl lg:text-5xl ${light ? "text-white" : "text-navy"}`}
      >
        {title}
      </H>
      {subtitle && (
        <p
          className={`mt-4 text-base sm:text-lg ${light ? "text-white/80" : "text-muted-foreground"}`}
        >
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
