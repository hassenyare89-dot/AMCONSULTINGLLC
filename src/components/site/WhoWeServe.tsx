import { motion, useReducedMotion } from "framer-motion";
import { Building2, HardHat, Shovel, Trees, Truck, Users, type LucideIcon } from "lucide-react";
import type { SiteContent } from "@/lib/content/defaults";
import { SectionHeader } from "./Services";

const ICONS: LucideIcon[] = [Truck, Users, HardHat, Shovel, Trees, Building2];

export function WhoWeServe({
  content,
  detailed = false,
  headingLevel = "h2",
}: {
  content: SiteContent["who_we_serve"];
  detailed?: boolean;
  headingLevel?: "h1" | "h2";
}) {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="wws-title" className="relative bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          id="wws-title"
          as={headingLevel}
          eyebrow="Who we serve"
          title="Built for hauling — top to bottom"
          subtitle={content.intro}
        />
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((a, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <motion.li
                key={a.title}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-all hover:border-brand-green/60"
              >
                <span
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white"
                  style={{ background: "var(--gradient-hero)" }}
                  aria-hidden
                >
                  <Icon className="h-6 w-6" />
                </span>
                <span>
                  <span className="block text-base font-semibold text-navy">{a.title}</span>
                  {(detailed || a.desc) && (
                    <span className="mt-1 block text-sm text-muted-foreground">{a.desc}</span>
                  )}
                </span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
