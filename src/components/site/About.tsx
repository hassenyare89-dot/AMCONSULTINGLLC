import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import heroFallback from "@/assets/hero-truck.jpg";
import { safeUrl } from "@/lib/shared/sanitize";
import type { SiteContent } from "@/lib/content/defaults";
import { SectionHeader } from "./Services";

/** Bundled About photos (public/media). The CMS "About image" field overrides the main one. */
const ABOUT_MAIN = "/media/about-main.jpg";
const ABOUT_INSET = "/media/about-inset.jpg";

export function About({
  content,
  headingLevel = "h2",
}: {
  content: SiteContent["about"];
  headingLevel?: "h1" | "h2";
}) {
  const reduce = useReducedMotion();
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) el.src = heroFallback;
  }, []);
  const src = content.imageUrl ? safeUrl(content.imageUrl) : ABOUT_MAIN;
  return (
    <section
      id="about"
      aria-labelledby="about-title"
      className="relative bg-surface py-24 sm:py-32"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="relative">
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative overflow-hidden rounded-3xl shadow-[var(--shadow-elevated)]"
          >
            <img
              ref={imgRef}
              src={src}
              alt={
                content.imageUrl
                  ? "Dump trucks at a construction site"
                  : "Yellow dump truck loaded with fill material at a busy construction site"
              }
              className="aspect-[4/3] h-full w-full object-cover object-[50%_70%]"
              loading="lazy"
              width={500}
              height={500}
              onError={(e) => {
                if (e.currentTarget.src !== heroFallback) e.currentTarget.src = heroFallback;
              }}
            />
            <div className="glass-dark absolute bottom-6 left-6 right-6 rounded-xl p-4 text-white">
              <div className="text-xs font-semibold uppercase tracking-wider text-brand-green-soft">
                Built for the field
              </div>
              <p className="mt-2 text-sm">
                We treat your project like our own — every load, every shift, every site.
              </p>
            </div>
          </motion.div>
          {!content.imageUrl && (
            <motion.img
              src={ABOUT_INSET}
              alt="Dump truck unloading fill dirt at a wooded job site"
              loading="lazy"
              width={150}
              height={150}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="absolute -right-3 -top-6 aspect-square w-28 rounded-2xl border-4 border-white object-cover shadow-[var(--shadow-elevated)] sm:-right-6 sm:w-36"
            />
          )}
        </div>
        <div>
          <SectionHeader
            id="about-title"
            as={headingLevel}
            eyebrow="About us"
            title={content.title}
            subtitle={content.intro}
          />
          {content.mission && (
            <p className="mt-6 border-l-4 border-brand-green pl-4 text-foreground">
              <strong className="text-navy">Our mission:</strong> {content.mission}
            </p>
          )}
          <ul className="mt-8 space-y-3">
            {content.expertise.map((b) => (
              <li key={b} className="flex items-start gap-3 text-foreground">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-brand-green-ink"
                  aria-hidden
                />
                <span className="text-sm sm:text-base">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {content.values?.length > 0 && (
        <div className="mx-auto mt-16 max-w-7xl px-4 sm:px-6 lg:px-8">
          <h3 className="text-xl font-bold text-navy">Our values</h3>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {content.values.map((v) => (
              <li
                key={v.title}
                className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
              >
                <h4 className="font-semibold text-navy">{v.title}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{v.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
