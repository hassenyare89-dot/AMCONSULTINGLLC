import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { getSiteContent } from "@/lib/api/content.functions";
import { DEFAULT_CONTENT } from "@/lib/content/defaults";
import { SITE_URL } from "@/lib/content/site";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: import("@tanstack/react-router").ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    try {
      return await getSiteContent();
    } catch {
      return { content: DEFAULT_CONTENT, faqs: [] };
    }
  },
  staleTime: 60_000,
  head: ({ loaderData }) => {
    const brand = (loaderData?.content ?? DEFAULT_CONTENT)["site.brand"];
    const title = "Dump Truck Dispatching & Hauling Consulting | AM Consulting LLC";
    const description =
      "Professional dump truck dispatching, load coordination, and hauling logistics in Atlanta, GA. Keeping trucks moving and projects on schedule.";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        { name: "description", content: description },
        { name: "author", content: brand.companyName },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: brand.companyName },
        { property: "og:url", content: `${SITE_URL}/` },
        { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${SITE_URL}/og-image.jpg` },
        { name: "theme-color", content: "#072A6C" },
        { name: "application-name", content: brand.companyName },
        { name: "apple-mobile-web-app-title", content: "AM Consulting" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
        { name: "format-detection", content: "telephone=no" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/favicon.ico", sizes: "any" },
        { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
        { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
        { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "mask-icon", href: "/safari-pinned-tab.svg", color: "#072A6C" },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap",
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfessionalService",
            name: brand.companyName,
            ...(brand.legalName ? { legalName: brand.legalName } : {}),
            url: `${SITE_URL}/`,
            logo: `${SITE_URL}/icon-512.png`,
            description:
              "Dump truck dispatching coordination, hauling consulting and logistics support for construction projects.",
            telephone: brand.phoneE164,
            email: brand.email,
            address: {
              "@type": "PostalAddress",
              streetAddress: brand.addressLine1,
              addressLocality: brand.city,
              addressRegion: brand.state,
              postalCode: brand.zip,
              addressCountry: "US",
            },
            areaServed: brand.serviceArea,
            serviceType: [
              "Dump Truck Dispatching",
              "Load Coordination",
              "Project Scheduling",
              "Hauling Logistics",
              "Transportation Consulting",
              "Contractor Support",
            ],
          }).replace(/</g, "\\u003c"),
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The management system and sign-in screens have their own chrome.
  const bare = pathname.startsWith("/admin") || pathname.startsWith("/auth");
  // Marks the document as interactive (used by end-to-end tests and progressive enhancement).
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {bare ? (
        <div className="min-h-screen bg-background">
          <Outlet />
        </div>
      ) : (
        <div className="flex min-h-screen flex-col bg-background">
          <Header />
          <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
            <Outlet />
          </main>
          <Footer />
        </div>
      )}
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
