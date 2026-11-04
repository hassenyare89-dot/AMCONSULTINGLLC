import { motion, useReducedMotion } from "framer-motion";
import { Award, Headphones, Radio, Timer, Users, Zap, type LucideIcon } from "lucide-react";
import type { SiteContent } from "@/lib/content/defaults";
import { SectionHeader } from "./Services";

const ICONS: LucideIcon[] = [Headphones, Radio, Zap, Timer, Award, Users];

export function WhyUs({
  content,
  companyName,
}: {
  content: SiteContent["why_us"];
  companyName: string;
}) {
  const reduce = useReducedMotion();
  return (
    <section
      aria-labelledby="why-title"
      className="relative overflow-hidden py-24 text-white sm:py-32"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, color-mix(in oklab, var(--brand-green) 35%, transparent), transparent 40%), radial-gradient(circle at 80% 60%, color-mix(in oklab, var(--brand-green) 22%, transparent), transparent 45%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          id="why-title"
          eyebrow="Why choose us"
          title={`Why choose ${companyName}?`}
          subtitle="We bring structure, accountability, and speed to every dispatch decision."
          light
        />
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((it, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <motion.li
                key={it.title}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
                className="glass-dark rounded-2xl p-6"
              >
                <div
                  className="grid h-11 w-11 place-items-center rounded-lg bg-brand-green/20 text-brand-green"
                  aria-hidden
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-bold">{it.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/80">{it.desc}</p>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
