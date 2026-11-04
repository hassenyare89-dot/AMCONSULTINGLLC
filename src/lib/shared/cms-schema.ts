import { z, type ZodTypeAny } from "zod";

/** CMS field specification — drives the editor UI and server-side validation. */
export type CmsField =
  | { name: string; label: string; type: "text"; max?: number; help?: string; required?: boolean }
  | { name: string; label: string; type: "textarea"; max?: number; help?: string }
  | { name: string; label: string; type: "richtext"; max?: number; help?: string }
  | { name: string; label: string; type: "url"; help?: string }
  | { name: string; label: string; type: "media"; kind: "image" | "video" | "model"; help?: string }
  | { name: string; label: string; type: "boolean"; help?: string }
  | {
      name: string;
      label: string;
      type: "select";
      options: readonly { value: string; label: string }[];
      help?: string;
    }
  | {
      name: string;
      label: string;
      type: "stringList";
      max?: number;
      maxItems?: number;
      help?: string;
    }
  | {
      name: string;
      label: string;
      type: "objectList";
      fields: readonly CmsField[];
      maxItems?: number;
      help?: string;
    };

export interface CmsSectionDef {
  key: string;
  page: string;
  title: string;
  description: string;
  fields: readonly CmsField[];
}

const URL_RE = /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+|#[\w-]*)?$/i;

function fieldSchema(f: CmsField): ZodTypeAny {
  switch (f.type) {
    case "text": {
      const s = z
        .string()
        .trim()
        .max(f.max ?? 200);
      return f.required ? s.min(1, `${f.label} is required`) : s;
    }
    case "textarea":
      return z.string().max(f.max ?? 2000);
    case "richtext":
      return z.string().max(f.max ?? 60000);
    case "url":
    case "media":
      return z
        .string()
        .trim()
        .max(2000)
        .regex(URL_RE, `${f.label} must be a site path or http(s) URL`);
    case "boolean":
      return z.boolean();
    case "select":
      return z.enum(f.options.map((o) => o.value) as [string, ...string[]]);
    case "stringList":
      return z
        .array(
          z
            .string()
            .trim()
            .max(f.max ?? 200),
        )
        .max(f.maxItems ?? 20);
    case "objectList":
      return z
        .array(z.object(Object.fromEntries(f.fields.map((c) => [c.name, fieldSchema(c)]))))
        .max(f.maxItems ?? 30);
  }
}

export function cmsSectionSchema(def: CmsSectionDef) {
  return z
    .object(Object.fromEntries(def.fields.map((f) => [f.name, fieldSchema(f).optional()])))
    .strict();
}

const HERO_MODES = [
  {
    value: "auto",
    label: "Automatic (3D on capable desktops, video on others, image if reduced motion)",
  },
  { value: "3d", label: "3D dump truck scene" },
  { value: "video", label: "Background video" },
  { value: "image", label: "Static image only" },
] as const;

const serviceFields: CmsField[] = [
  { name: "slug", label: "URL slug", type: "text", max: 60, required: true },
  { name: "title", label: "Title", type: "text", max: 80, required: true },
  { name: "summary", label: "Card summary", type: "textarea", max: 300 },
  { name: "description", label: "Detailed description", type: "textarea", max: 3000 },
  { name: "benefits", label: "Benefits", type: "stringList", max: 200, maxItems: 10 },
  { name: "process", label: "Process steps", type: "stringList", max: 200, maxItems: 10 },
];

export const CMS_SECTIONS: readonly CmsSectionDef[] = [
  {
    key: "site.brand",
    page: "Global",
    title: "Brand & contact details",
    description:
      "Company name, logo, and contact details shown in the header, footer, emails and structured data. Verify against registered business records.",
    fields: [
      {
        name: "companyName",
        label: "Display company name",
        type: "text",
        max: 100,
        required: true,
      },
      { name: "legalName", label: "Registered legal name (verify)", type: "text", max: 120 },
      { name: "tagline", label: "Tagline", type: "text", max: 120 },
      {
        name: "logoUrl",
        label: "Logo",
        type: "media",
        kind: "image",
        help: "Leave blank to use the original logo asset.",
      },
      { name: "phone", label: "Phone (display)", type: "text", max: 30 },
      { name: "phoneE164", label: "Phone (dialable, e.g. +1-404-862-0305)", type: "text", max: 30 },
      { name: "email", label: "Public email", type: "text", max: 120 },
      { name: "addressLine1", label: "Street address", type: "text", max: 120 },
      { name: "city", label: "City", type: "text", max: 60 },
      { name: "state", label: "State", type: "text", max: 2 },
      { name: "zip", label: "ZIP", type: "text", max: 10 },
      { name: "serviceArea", label: "Service area", type: "text", max: 120 },
      { name: "hours", label: "Business hours (display)", type: "text", max: 120 },
    ],
  },
  {
    key: "site.social",
    page: "Global",
    title: "Social media links",
    description: "Leave a link blank to hide its icon.",
    fields: [
      { name: "facebook", label: "Facebook URL", type: "url" },
      { name: "linkedin", label: "LinkedIn URL", type: "url" },
      { name: "instagram", label: "Instagram URL", type: "url" },
      { name: "x", label: "X / Twitter URL", type: "url" },
    ],
  },
  {
    key: "home.hero",
    page: "Home",
    title: "Homepage hero",
    description:
      "Headline, calls to action, and the cinematic background (3D scene, video, or image).",
    fields: [
      { name: "eyebrow", label: "Eyebrow label", type: "text", max: 80 },
      { name: "headline", label: "Headline", type: "text", max: 120, required: true },
      {
        name: "headlineAccent",
        label: "Highlighted part of headline (must appear in headline)",
        type: "text",
        max: 80,
      },
      { name: "subheadline", label: "Supporting headline", type: "text", max: 160 },
      { name: "description", label: "Supporting description", type: "textarea", max: 400 },
      { name: "primaryCtaLabel", label: "Primary button label", type: "text", max: 40 },
      { name: "primaryCtaHref", label: "Primary button link", type: "url" },
      { name: "secondaryCtaLabel", label: "Secondary button label", type: "text", max: 40 },
      { name: "secondaryCtaHref", label: "Secondary button link", type: "url" },
      { name: "tertiaryCtaLabel", label: "Third link label", type: "text", max: 40 },
      { name: "tertiaryCtaHref", label: "Third link", type: "url" },
      {
        name: "badges",
        label: "Short factual badges",
        type: "stringList",
        max: 60,
        maxItems: 4,
        help: "Only statements the company can substantiate.",
      },
      { name: "mode", label: "Background mode", type: "select", options: HERO_MODES },
      {
        name: "videoUrl",
        label: "Background video (MP4/WebM)",
        type: "media",
        kind: "video",
        help: "Blank = original hero video asset.",
      },
      {
        name: "posterUrl",
        label: "Poster / fallback image",
        type: "media",
        kind: "image",
        help: "Blank = bundled hero-truck.jpg.",
      },
      {
        name: "modelUrl",
        label: "Optional 3D truck model (GLB)",
        type: "media",
        kind: "model",
        help: "Blank = built-in procedural dump truck.",
      },
    ],
  },
  {
    key: "home.highlights",
    page: "Home",
    title: "Highlights / statistics",
    description:
      "Only items marked “Verified” are displayed. Never publish numbers you cannot substantiate.",
    fields: [
      {
        name: "items",
        label: "Highlights",
        type: "objectList",
        maxItems: 4,
        fields: [
          { name: "value", label: "Value (e.g. 24/7)", type: "text", max: 20 },
          { name: "label", label: "Label", type: "text", max: 60 },
          { name: "verified", label: "Verified by company records", type: "boolean" },
        ],
      },
    ],
  },
  {
    key: "home.sections",
    page: "Home",
    title: "Homepage sections",
    description: "Show or hide homepage sections.",
    fields: [
      { name: "showHighlights", label: "Show highlights band", type: "boolean" },
      { name: "showServices", label: "Show services", type: "boolean" },
      { name: "showWhoWeServe", label: "Show who we serve", type: "boolean" },
      { name: "showWhyUs", label: "Show why choose us", type: "boolean" },
      { name: "showProcess", label: "Show how it works", type: "boolean" },
      { name: "showCta", label: "Show closing call-to-action", type: "boolean" },
      { name: "ctaTitle", label: "Closing CTA title", type: "text", max: 120 },
      { name: "ctaBody", label: "Closing CTA text", type: "textarea", max: 400 },
    ],
  },
  {
    key: "about",
    page: "About",
    title: "About us",
    description: "Company profile, mission, values and expertise.",
    fields: [
      { name: "title", label: "Title", type: "text", max: 120 },
      { name: "intro", label: "Introduction", type: "textarea", max: 1500 },
      { name: "mission", label: "Mission", type: "textarea", max: 800 },
      {
        name: "values",
        label: "Values",
        type: "objectList",
        maxItems: 8,
        fields: [
          { name: "title", label: "Value", type: "text", max: 60 },
          { name: "desc", label: "Description", type: "textarea", max: 300 },
        ],
      },
      { name: "expertise", label: "Expertise bullets", type: "stringList", max: 200, maxItems: 10 },
      {
        name: "imageUrl",
        label: "Image",
        type: "media",
        kind: "image",
        help: "Blank = original about image.",
      },
    ],
  },
  {
    key: "services",
    page: "Services",
    title: "Services",
    description: "Service cards and detail pages (/services/<slug>).",
    fields: [
      { name: "intro", label: "Services intro", type: "textarea", max: 400 },
      { name: "items", label: "Services", type: "objectList", maxItems: 12, fields: serviceFields },
    ],
  },
  {
    key: "who_we_serve",
    page: "Who We Serve",
    title: "Who we serve",
    description: "Audiences served.",
    fields: [
      { name: "intro", label: "Intro", type: "textarea", max: 400 },
      {
        name: "items",
        label: "Audiences",
        type: "objectList",
        maxItems: 10,
        fields: [
          { name: "title", label: "Audience", type: "text", max: 80 },
          { name: "desc", label: "How we help", type: "textarea", max: 400 },
        ],
      },
    ],
  },
  {
    key: "why_us",
    page: "Home",
    title: "Why choose us",
    description: "Benefits section.",
    fields: [
      {
        name: "items",
        label: "Benefits",
        type: "objectList",
        maxItems: 9,
        fields: [
          { name: "title", label: "Title", type: "text", max: 80 },
          { name: "desc", label: "Description", type: "textarea", max: 300 },
        ],
      },
    ],
  },
  {
    key: "process",
    page: "How It Works",
    title: "How it works",
    description: "Process steps.",
    fields: [
      { name: "intro", label: "Intro", type: "textarea", max: 400 },
      {
        name: "steps",
        label: "Steps",
        type: "objectList",
        maxItems: 8,
        fields: [
          { name: "title", label: "Step", type: "text", max: 60 },
          { name: "desc", label: "Description", type: "textarea", max: 400 },
        ],
      },
    ],
  },
  {
    key: "footer",
    page: "Global",
    title: "Footer",
    description: "Footer blurb and extra links.",
    fields: [
      { name: "blurb", label: "Blurb", type: "textarea", max: 400 },
      {
        name: "links",
        label: "Extra links",
        type: "objectList",
        maxItems: 8,
        fields: [
          { name: "label", label: "Label", type: "text", max: 40 },
          { name: "href", label: "Link", type: "url" },
        ],
      },
    ],
  },
  {
    key: "seo",
    page: "Global",
    title: "SEO titles & descriptions",
    description: "Search titles and meta descriptions per page.",
    fields: [
      {
        name: "pages",
        label: "Pages",
        type: "objectList",
        maxItems: 30,
        fields: [
          { name: "path", label: "Path (e.g. /about)", type: "text", max: 80 },
          { name: "title", label: "Title", type: "text", max: 70 },
          { name: "description", label: "Description", type: "textarea", max: 170 },
        ],
      },
    ],
  },
  ...(["privacy", "terms", "accessibility", "cookies"] as const).map((k) => ({
    key: `legal.${k}`,
    page: "Legal",
    title: {
      privacy: "Privacy Policy",
      terms: "Terms of Use",
      accessibility: "Accessibility Statement",
      cookies: "Cookie Policy",
    }[k],
    description:
      "DRAFT — requires review by the company and qualified legal counsel before publication.",
    fields: [
      { name: "title", label: "Title", type: "text", max: 120 },
      { name: "lastUpdated", label: "Last updated (display)", type: "text", max: 40 },
      { name: "body", label: "Body", type: "richtext", max: 60000 },
    ] as CmsField[],
  })),
];

export function getCmsSection(key: string): CmsSectionDef | undefined {
  return CMS_SECTIONS.find((s) => s.key === key);
}

/** Recursively collects rich-text field paths so the server can sanitize them. */
export function richTextFieldNames(def: CmsSectionDef): string[] {
  return def.fields.filter((f) => f.type === "richtext").map((f) => f.name);
}
