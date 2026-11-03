import { lazy, Suspense, useEffect, useRef, useState, Component, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Pause,
  Play,
  Route as RouteIcon,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { SmartLink } from "./SmartLink";
import heroVideoAsset from "@/assets/hero.mp4.asset.json";
import heroPoster from "@/assets/hero-truck.jpg";
import { Button } from "@/components/ui/button";
import { safeUrl } from "@/lib/shared/sanitize";
import type { SiteContent } from "@/lib/content/defaults";

const TruckScene = lazy(() => import("./three/TruckScene"));

type HeroContent = SiteContent["home.hero"];
type Mode = "3d" | "video" | "image";
const PREF_KEY = "amc_hero_paused";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Chooses the richest background the device can comfortably render. */
export function chooseHeroMode(
  requested: string,
  env: { reducedMotion: boolean; saveData: boolean; webgl: boolean; width: number; cores: number },
): Mode {
  if (env.reducedMotion || requested === "image") return "image";
  if (requested === "video") return env.saveData ? "image" : "video";
  if (requested === "3d") return env.webgl ? "3d" : env.saveData ? "image" : "video";
  if (env.webgl && env.width >= 1024 && env.cores >= 4 && !env.saveData) return "3d";
  return env.saveData ? "image" : "video";
}

class SceneBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Headline({ text, accent }: { text: string; accent?: string }) {
  if (!accent || !text.includes(accent)) return <>{text}</>;
  const [before, after] = text.split(accent);
  return (
    <>
      {before}
      <span className="text-brand-green-soft">{accent}</span>
      {after}
    </>
  );
}

export function HeroView({ c, preview = false }: { c: HeroContent; preview?: boolean }) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>("image");
  const [userPaused, setUserPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const section = useRef<HTMLElement>(null);
  const scroll = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const poster = c.posterUrl ? safeUrl(c.posterUrl) : heroPoster;
  const videoSrc = c.videoUrl ? safeUrl(c.videoUrl) : heroVideoAsset.url;

  useEffect(() => {
    if (preview) return;
    try {
      setUserPaused(localStorage.getItem(PREF_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    setMode(
      chooseHeroMode(c.mode || "auto", {
        reducedMotion: Boolean(reduce),
        saveData: Boolean(nav.connection?.saveData),
        webgl: hasWebGL(),
        width: window.innerWidth,
        cores: navigator.hardwareConcurrency || 2,
      }),
    );
  }, [c.mode, reduce, preview]);

  // Pause rendering when the hero is off-screen or the tab is hidden.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden && el.getBoundingClientRect().bottom > 0);
    document.addEventListener("visibilitychange", onVis);
    const onScroll = () => {
      const h = el.offsetHeight || 1;
      scroll.current = Math.min(1, Math.max(0, window.scrollY / h));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      };
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const paused = userPaused || !visible;
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused, mode]);

  const togglePause = () => {
    setUserPaused((p) => {
      try {
        localStorage.setItem(PREF_KEY, p ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !p;
    });
  };

  const showMotion = mode !== "image" && !preview;
  const ctas = [
    { label: c.primaryCtaLabel, href: c.primaryCtaHref, kind: "primary" },
    { label: c.secondaryCtaLabel, href: c.secondaryCtaHref, kind: "secondary" },
  ].filter((x) => x.label && x.href);

  return (
    <section
      ref={section}
      id="home"
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-navy-deep pt-16"
    >
      <div className="absolute inset-0 -z-10">
        {/* Poster image is always rendered first (fast LCP, no-JS and reduced-motion fallback). */}
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
          fetchPriority="high"
          decoding="async"
          width={1920}
          height={1080}
        />
        {showMotion && mode === "video" && (
          <video
            ref={videoRef}
            src={videoSrc}
            poster={poster}
            autoPlay={!paused}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setMode("image")}
          />
        )}
        {showMotion && mode === "3d" && (
          <div
            className={`absolute inset-0 transition-opacity duration-700 ${sceneReady ? "opacity-100" : "opacity-0"}`}
          >
            <SceneBoundary onError={() => setMode("video")}>
              <Suspense fallback={null}>
                <TruckScene
                  input={{ scroll, pointer }}
                  paused={paused}
                  modelUrl={c.modelUrl ? safeUrl(c.modelUrl) : undefined}
                  onReady={() => setSceneReady(true)}
                />
              </Suspense>
            </SceneBoundary>
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(100deg, color-mix(in oklab, var(--navy-deep) 88%, transparent) 0%, color-mix(in oklab, var(--navy) 55%, transparent) 48%, transparent 78%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
          style={{
            background:
              "linear-gradient(0deg, color-mix(in oklab, var(--navy-deep) 70%, transparent), transparent)",
          }}
        />
      </div>

      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:px-8">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-white lg:col-span-7"
        >
          {c.eyebrow && (
            <span className="glass-dark inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-green-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-green" aria-hidden />
              {c.eyebrow}
            </span>
          )}
          <h1
            id="hero-title"
            className="mt-5 text-4xl font-extrabold leading-[1.05] text-white sm:text-5xl lg:text-6xl"
          >
            <Headline text={c.headline} accent={c.headlineAccent} />
          </h1>
          {c.subheadline && (
            <p className="mt-5 text-xl font-semibold text-white sm:text-2xl">{c.subheadline}</p>
          )}
          {c.description && (
            <p className="mt-4 max-w-xl text-base text-white/85 sm:text-lg">{c.description}</p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            {ctas.map((x) => (
              <Button
                key={x.href}
                asChild
                size="lg"
                className={
                  x.kind === "primary"
                    ? "bg-brand-green text-navy-deep shadow-[var(--shadow-glow)] hover:bg-brand-green/90"
                    : "border border-white/40 bg-white/10 text-white hover:bg-white/20"
                }
              >
                <SmartLink href={x.href}>
                  {x.kind === "primary" ? (
                    <ArrowRight className="mr-2 h-4 w-4" aria-hidden />
                  ) : (
                    <Truck className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {x.label}
                </SmartLink>
              </Button>
            ))}
            {c.tertiaryCtaLabel && c.tertiaryCtaHref && (
              <SmartLink
                href={c.tertiaryCtaHref}
                className="inline-flex min-h-11 items-center px-2 font-semibold text-white underline decoration-brand-green decoration-2 underline-offset-4 hover:text-brand-green-soft focus-visible:focus-brand rounded"
              >
                {c.tertiaryCtaLabel}
              </SmartLink>
            )}
          </div>
          {c.badges?.length > 0 && (
            <ul className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-white/80">
              {c.badges.map((b) => (
                <li key={b} className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-green" aria-hidden /> {b}
                </li>
              ))}
            </ul>
          )}
        </motion.div>

        {/* Floating dispatch cards — illustrate the workflow; they are not live metrics. */}
        <div
          className="relative hidden h-[420px] lg:col-span-5 lg:block"
          aria-label="How a dispatch is coordinated (illustration)"
          role="img"
        >
          <FloatingCard
            delay={0.2}
            className="absolute right-6 top-0 w-64"
            icon={<ClipboardList className="h-5 w-5" />}
            label="Job details"
            body="Material, quantity, site access and timing confirmed"
          />
          <FloatingCard
            delay={0.4}
            className="absolute left-0 top-40 w-72"
            icon={<RouteIcon className="h-5 w-5" />}
            label="Route planned"
            body="Pickup → jobsite coordinated with the driver"
          />
          <FloatingCard
            delay={0.6}
            className="absolute bottom-0 right-0 w-60"
            icon={<CalendarCheck className="h-5 w-5" />}
            label="On schedule"
            body="Follow-up after every completed load"
          />
        </div>
      </div>

      {showMotion && (
        <button
          type="button"
          onClick={togglePause}
          aria-pressed={userPaused}
          className="absolute bottom-5 right-5 z-10 inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/60 focus-visible:focus-brand"
        >
          {userPaused ? (
            <Play className="h-4 w-4" aria-hidden />
          ) : (
            <Pause className="h-4 w-4" aria-hidden />
          )}
          {userPaused ? "Play background" : "Pause background"}
        </button>
      )}
      <p className="sr-only">
        Background:{" "}
        {mode === "3d"
          ? "an animated 3D dump truck driving on a construction site road and raising its dump body"
          : mode === "video"
            ? "a video of dump trucks at work"
            : "a photo of a dump truck"}
        .
      </p>
    </section>
  );
}

function FloatingCard({
  className,
  icon,
  label,
  body,
  delay = 0,
}: {
  className?: string;
  icon: ReactNode;
  label: string;
  body: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay }}
      className={`glass-dark rounded-xl p-4 text-white shadow-[var(--shadow-elevated)] ${className}`}
    >
      <motion.div
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 4 + delay, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-green-soft">
          <span
            className="grid h-7 w-7 place-items-center rounded-md bg-brand-green/20 text-brand-green"
            aria-hidden
          >
            {icon}
          </span>
          {label}
        </div>
        <p className="mt-2 text-sm text-white/85">{body}</p>
      </motion.div>
    </motion.div>
  );
}

/** Homepage hero bound to published CMS content. */
export function Hero({ content }: { content: HeroContent }) {
  return <HeroView c={content} />;
}
