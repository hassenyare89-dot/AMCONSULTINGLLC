import { motion, useReducedMotion } from "framer-motion";
import { ClipboardCheck, Flag, MessageSquare, Radio, type LucideIcon } from "lucide-react";
import type { SiteContent } from "@/lib/content/defaults";
import { SectionHeader } from "./Services";

const ICONS: LucideIcon[] = [MessageSquare, ClipboardCheck, Radio, Flag];

export function Process({
  content,
  headingLevel = "h2",
}: {
  content: SiteContent["process"];
  headingLevel?: "h1" | "h2";
}) {
  const reduce = useReducedMotion();
  return (
    <section
      id="process"
      aria-labelledby="process-title"
      className="relative overflow-hidden bg-background py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          id="process-title"
          as={headingLevel}
          eyebrow="How it works"
          title="A clear, four-step process"
          subtitle={content.intro}
        />
        <div className="relative mt-16">
          <div
            className="route-dash absolute left-0 right-0 top-10 hidden h-px lg:block"
            aria-hidden
          />
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {content.steps.map((s, i) => {
              const Icon = ICONS[i % ICONS.length];
              return (
                <motion.li
                  key={s.title}
                  initial={reduce ? false : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="relative text-center"
                >
                  <div className="relative mx-auto h-20 w-20">
                    <div
                      className="relative grid h-20 w-20 place-items-center rounded-full border-4 border-background text-white"
                      style={{ background: "var(--gradient-hero)" }}
                      aria-hidden
                    >
                      <Icon className="h-8 w-8" />
                      <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-brand-green text-xs font-bold text-navy-deep">
                        {i + 1}
                      </span>
                    </div>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-navy">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
