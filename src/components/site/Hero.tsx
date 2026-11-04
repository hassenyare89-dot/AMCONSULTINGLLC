import { lazy, Suspense, useEffect, useRef, useState, Component, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronDown, Pause, Play, ShieldCheck, Truck } from "lucide-react";
import { SmartLink } from "./SmartLink";
import { Button } from "@/components/ui/button";
import { safeUrl } from "@/lib/shared/sanitize";
import type { SiteContent } from "@/lib/content/defaults";

const TruckScene = lazy(() => import("./three/TruckScene"));

/** Bundled landing video (aerial dump trucks at a sand quarry), served from public/media. */
const DEFAULT_VIDEO = { webm: "/media/hero.webm", mp4: "/media/hero.mp4" };
const DEFAULT_POSTER = "/media/hero-poster.jpg";

type HeroContent = SiteContent["home.hero"];
type Mode = "3d" | "video" | "image";

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
  const poster = c.posterUrl ? safeUrl(c.posterUrl) : DEFAULT_POSTER;
  const customVideo = c.videoUrl ? safeUrl(c.videoUrl) : null;

  useEffect(() => {
    if (preview) return;
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

  const togglePause = () => setUserPaused((p) => !p);

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
      className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-navy-deep pt-16 lg:items-center"
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
            src={customVideo ?? undefined}
            poster={poster}
            autoPlay={!paused}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover [filter:saturate(1.12)_contrast(1.05)]"
            onError={() => setMode("image")}
          >
            {!customVideo && (
              <>
                <source src={DEFAULT_VIDEO.webm} type="video/webm" />
                {/* A <source> failure doesn't fire on <video>; fall back once the last one fails. */}
                <source src={DEFAULT_VIDEO.mp4} type="video/mp4" onError={() => setMode("image")} />
              </>
            )}
          </video>
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
        {/* Readability without a panel: a soft neutral (untinted) gradient behind the text area
            only — from the left on large screens, from the bottom on phones/tablets where the
            text sits low — plus a top fade for the header. The rest of the footage stays clear. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32"
          style={{ background: "linear-gradient(180deg, rgb(0 0 0 / 0.45), transparent)" }}
        />
        <div
          className="pointer-events-none absolute inset-0 hidden lg:block"
          style={{
            background:
              "linear-gradient(90deg, rgb(0 0 0 / 0.66) 0%, rgb(0 0 0 / 0.56) 50%, rgb(0 0 0 / 0.22) 66%, transparent 82%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{
            background:
              "linear-gradient(0deg, rgb(0 0 0 / 0.66) 0%, rgb(0 0 0 / 0.55) 52%, rgb(0 0 0 / 0.12) 72%, transparent 85%)",
          }}
        />
      </div>

      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pb-14 pt-[38svh] sm:px-6 lg:grid-cols-12 lg:px-8 lg:pb-16 lg:pt-8">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="hero-copy text-white lg:col-span-8 xl:col-span-7"
        >
          {c.eyebrow && (
            <span className="glass-dark inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-green-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-green" aria-hidden />
              {c.eyebrow}
            </span>
          )}
          <h1
            id="hero-title"
            className="mt-3 text-[2rem] font-extrabold leading-[1.05] sm:mt-4 text-white [text-shadow:0_2px_24px_rgb(0_0_0/0.35)] sm:text-5xl"
          >
            <Headline text={c.headline} accent={c.headlineAccent} />
          </h1>
          {c.subheadline && (
            <p className="mt-3 text-base font-semibold text-white sm:mt-4 sm:text-xl">
              {c.subheadline}
            </p>
          )}
          {c.description && (
            <p className="mt-3 max-w-xl text-sm text-white sm:text-base">{c.description}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
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
            <ul className="mt-6 hidden flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/15 pt-5 text-sm text-white sm:flex">
              {c.badges.map((b) => (
                <li key={b} className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-green" aria-hidden /> {b}
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>

      {!reduce && (
        <a
          href="#main-after-hero"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 text-white/90 drop-shadow"
        >
          <ChevronDown className="h-7 w-7 animate-bounce" />
        </a>
      )}

      {showMotion && (
        // WCAG 2.2.2: moving background must be pausable. Hidden until focused with the keyboard,
        // so it doesn't sit on top of the video for mouse and touch visitors.
        <button
          type="button"
          onClick={togglePause}
          aria-pressed={userPaused}
          className="sr-only z-20 focus:not-sr-only focus:absolute focus:bottom-5 focus:right-5 focus:inline-flex focus:items-center focus:gap-2 focus:rounded-full focus:bg-black/70 focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus-visible:focus-brand"
        >
          {userPaused ? (
            <Play className="h-4 w-4" aria-hidden />
          ) : (
            <Pause className="h-4 w-4" aria-hidden />
          )}
          {userPaused ? "Play background video" : "Pause background video"}
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
      <span id="main-after-hero" className="absolute bottom-0" aria-hidden />
    </section>
  );
}

/** Homepage hero bound to published CMS content. */
export function Hero({ content }: { content: HeroContent }) {
  return <HeroView c={content} />;
}
