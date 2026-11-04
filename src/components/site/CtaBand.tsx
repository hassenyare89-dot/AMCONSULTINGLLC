import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function CtaBand({
  title,
  body,
  phone,
  phoneE164,
}: {
  title: string;
  body: string;
  phone: string;
  phoneE164: string;
}) {
  return (
    <section aria-labelledby="cta-title" className="bg-surface py-20">
      <div
        className="mx-auto max-w-5xl rounded-3xl px-6 py-12 text-center text-white shadow-[var(--shadow-elevated)] sm:px-12"
        style={{ background: "var(--gradient-hero)" }}
      >
        <h2 id="cta-title" className="text-3xl font-extrabold sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-white/85">{body}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="bg-brand-green text-navy-deep hover:bg-brand-green/90"
          >
            <Link to="/quote">Request a quote</Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="border border-white/40 bg-white/10 text-white hover:bg-white/20"
          >
            <Link to="/book">Book a consultation</Link>
          </Button>
          <Button asChild size="lg" variant="link" className="text-white">
            <a href={`tel:${phoneE164}`}>Call {phone}</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
