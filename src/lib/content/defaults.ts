import { LEGAL_DEFAULTS } from "./legal";

/**
 * Default website content. Used whenever a CMS section has not been published yet, so the
 * public site always renders. Copy is carried over from the original site; claims that could
 * not be substantiated from the repository were replaced with factual descriptions.
 */

export type ServiceItem = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  benefits: string[];
  process: string[];
};

export const DEFAULT_CONTENT = {
  "site.brand": {
    companyName: "AM Consulting LLC",
    legalName: "",
    tagline: "Keeping trucks moving. Keeping projects on schedule.",
    logoUrl: "",
    phone: "404-862-0305",
    phoneE164: "+1-404-862-0305",
    email: "info@amconsultingllc.net",
    addressLine1: "5300 Memorial Dr. Unit 103C",
    city: "Stone Mountain",
    state: "GA",
    zip: "30083",
    serviceArea: "Atlanta, GA & surrounding areas",
    hours: "Mon–Fri · 7am – 6pm ET",
  },
  "site.social": { facebook: "", linkedin: "", instagram: "", x: "" },
  "home.hero": {
    eyebrow: "Atlanta, GA & surrounding areas",
    headline: "Professional Dump Truck Dispatching & Hauling Consulting Services",
    headlineAccent: "Dispatching & Hauling Consulting",
    subheadline: "Keeping Trucks Moving. Keeping Projects On Schedule.",
    description:
      "AM Consulting LLC provides professional dispatching coordination, hauling consulting, transportation support, and construction logistics solutions for truck operators, contractors, and project teams.",
    primaryCtaLabel: "Request Dispatch Services",
    primaryCtaHref: "/quote",
    secondaryCtaLabel: "Register Your Truck",
    secondaryCtaHref: "/drivers",
    tertiaryCtaLabel: "Contact Our Team",
    tertiaryCtaHref: "/contact",
    badges: ["Dispatch coordination", "Load & schedule planning", "Owner-operators & contractors"],
    mode: "video",
    videoUrl: "",
    posterUrl: "",
    modelUrl: "",
  },
  "home.highlights": {
    // Intentionally unverified: these are NOT shown until an administrator verifies them.
    items: [
      { value: "", label: "Loads coordinated", verified: false },
      { value: "", label: "Clients served", verified: false },
    ],
  },
  "home.sections": {
    showHighlights: true,
    showServices: true,
    showWhoWeServe: true,
    showWhyUs: true,
    showProcess: true,
    showCta: true,
    ctaTitle: "Ready to keep your trucks moving?",
    ctaBody:
      "Tell us about your project or your fleet. Our team will follow up to talk through scheduling, coordination, and next steps.",
  },
  about: {
    title: "About AM Consulting",
    intro:
      "We specialize in dispatching and logistics support for the hauling industry. Our goal is to help truck owners increase utilization while providing contractors with reliable hauling solutions for their projects.",
    mission:
      "To bring structure, clear communication, and dependable coordination to every haul — so owner-operators stay productive and project teams stay on schedule.",
    values: [
      {
        title: "Clear communication",
        desc: "Transparent communication from first call to final load.",
      },
      {
        title: "Reliability",
        desc: "Schedules built around your project plan, confirmed in writing.",
      },
      {
        title: "Safety first",
        desc: "We coordinate work with safety and compliance responsibilities in mind.",
      },
      {
        title: "Partnership",
        desc: "We treat your project like our own — every load, every shift, every site.",
      },
    ],
    expertise: [
      "Dispatching & logistics support built for the hauling industry",
      "Helping truck owners increase utilization and reduce downtime",
      "Reliable hauling solutions for contractors and project owners",
      "Transparent communication from first call to final load",
    ],
    imageUrl: "",
  },
  services: {
    intro:
      "Core services that keep dump trucks loaded, contractors supported, and projects on schedule.",
    items: [
      {
        slug: "dump-truck-dispatching",
        title: "Dump Truck Dispatching",
        summary:
          "We coordinate loads, routes, and schedules to help truck owners maximize productivity and reduce downtime.",
        description:
          "Our dispatch coordinators act as an administrative extension of your operation: we look for suitable hauling work in your service area, communicate with project contacts, confirm schedules, and keep you informed throughout the job. You stay in control of which work you accept.",
        benefits: [
          "Less time spent searching for work",
          "Fewer idle hours between jobs",
          "One point of contact for scheduling questions",
          "Clear written job details before each assignment",
        ],
        process: [
          "Intro call to understand your trucks, area, and availability",
          "We identify and present suitable jobs",
          "You confirm the work you accept",
          "We coordinate scheduling and follow up after the job",
        ],
      },
      {
        slug: "load-coordination",
        title: "Load Coordination",
        summary:
          "We match available trucks with hauling opportunities and manage communication throughout the job.",
        description:
          "We align truck availability with project requirements — material, quantity, site access, and timing — and keep drivers and site contacts in sync as plans change.",
        benefits: [
          "Right equipment for the material and site",
          "Fewer miscommunications on site",
          "Changes communicated quickly to everyone involved",
        ],
        process: [
          "Gather load requirements",
          "Match available trucks",
          "Confirm details with all parties",
          "Track completion and close out",
        ],
      },
      {
        slug: "project-scheduling",
        title: "Project Scheduling",
        summary:
          "Phased hauling schedules aligned with your build plan so equipment never sits idle.",
        description:
          "We help plan hauling around construction phases — excavation, grading, base, and cleanup — so trucks arrive when the site is ready and leave when the work is done.",
        benefits: [
          "Hauling aligned to construction phases",
          "Reduced standby time",
          "Advance notice of schedule changes",
        ],
        process: [
          "Review the project schedule",
          "Build a hauling plan by phase",
          "Coordinate trucks for each phase",
          "Adjust as the site schedule moves",
        ],
      },
      {
        slug: "hauling-logistics",
        title: "Hauling Logistics",
        summary: "From scheduling to job tracking, we help streamline hauling operations.",
        description:
          "We organise the moving parts of a hauling operation — pickup and dump locations, timing, documentation, and communication — into a clear, trackable plan.",
        benefits: [
          "Organised job records",
          "Clear pickup/destination details",
          "Consistent follow-up and close-out",
        ],
        process: [
          "Map pickup and destination needs",
          "Plan timing and truck counts",
          "Coordinate execution",
          "Record completion",
        ],
      },
      {
        slug: "transportation-consulting",
        title: "Transportation Consulting",
        summary:
          "Process reviews and operations strategy for hauling-heavy contractors and truck owners.",
        description:
          "We review how your hauling work is planned, dispatched, and documented today and recommend practical improvements. Consulting is advisory; regulatory and legal questions should be confirmed with the appropriate authority or counsel.",
        benefits: [
          "An outside view of your hauling process",
          "Practical, prioritised recommendations",
          "Better documentation habits",
        ],
        process: [
          "Discovery conversation",
          "Process review",
          "Written recommendations",
          "Optional follow-up session",
        ],
      },
      {
        slug: "contractor-support",
        title: "Contractor Support",
        summary:
          "We assist contractors in securing dependable hauling coordination for construction projects.",
        description:
          "For general contractors, excavation, and site-development teams, we coordinate hauling capacity and communication so your superintendents can focus on the build.",
        benefits: [
          "Single coordination contact",
          "Scalable truck counts as the job changes",
          "Regular schedule confirmations",
        ],
        process: [
          "Share project scope and dates",
          "Receive a coordination plan or estimate",
          "We coordinate trucks for your schedule",
          "Review and close out",
        ],
      },
    ] satisfies ServiceItem[],
  },
  who_we_serve: {
    intro: "From single-truck owner-operators to multi-site contractors, we keep loads moving.",
    items: [
      {
        title: "Independent dump truck owners",
        desc: "Dispatch coordination so you can spend more time hauling and less time searching for work.",
      },
      {
        title: "Fleet owners",
        desc: "Coordination across multiple trucks and drivers with clear job records.",
      },
      {
        title: "Construction contractors",
        desc: "Hauling coordination aligned with your project schedule.",
      },
      {
        title: "Excavation companies",
        desc: "Trucks coordinated around excavation and grading phases.",
      },
      {
        title: "Landscaping companies",
        desc: "Material delivery and removal coordinated with your crews.",
      },
      {
        title: "Site development projects",
        desc: "Phased hauling plans for site work and development.",
      },
    ],
  },
  why_us: {
    items: [
      {
        title: "Dispatch-focused support",
        desc: "Coordinators who understand hauling, routing, and project flow.",
      },
      {
        title: "Load coordination",
        desc: "We work to match the right trucks with the right loads.",
      },
      {
        title: "Fast communication",
        desc: "Prompt responses to drivers, contractors, and project managers.",
      },
      {
        title: "Efficient scheduling",
        desc: "Schedules built to keep trucks rolling and projects on track.",
      },
      {
        title: "Professional service",
        desc: "Organised coordination from first call to final load.",
      },
      { title: "A team you can reach", desc: "Real people committed to your project's success." },
    ],
  },
  process: {
    intro: "From the first call to the final load, you always know what's happening.",
    steps: [
      {
        title: "Consultation",
        desc: "Tell us about your trucks or your project — scope, location, timing, and equipment.",
      },
      {
        title: "Assessment",
        desc: "We review requirements and availability and confirm what coordination you need.",
      },
      {
        title: "Dispatch coordination",
        desc: "Loads are scheduled and coordinated, with details confirmed before work begins.",
      },
      {
        title: "Follow-up",
        desc: "We confirm completion, capture feedback, and plan the next phase.",
      },
    ],
  },
  footer: {
    blurb:
      "AM Consulting LLC provides dispatching coordination, hauling consulting, and logistics support that keep construction projects on schedule.",
    links: [] as { label: string; href: string }[],
  },
  seo: {
    pages: [
      {
        path: "/",
        title: "Dump Truck Dispatching & Hauling Consulting | AM Consulting LLC",
        description:
          "Professional dump truck dispatching, load coordination, and hauling logistics in Atlanta, GA. Keeping trucks moving and projects on schedule.",
      },
      {
        path: "/about",
        title: "About | AM Consulting LLC",
        description:
          "Dispatching and logistics support for the hauling industry — helping truck owners and contractors stay on schedule.",
      },
      {
        path: "/services",
        title: "Services | AM Consulting LLC",
        description:
          "Dump truck dispatching, load coordination, project scheduling, hauling logistics, transportation consulting, and contractor support.",
      },
      {
        path: "/who-we-serve",
        title: "Who We Serve | AM Consulting LLC",
        description:
          "Owner-operators, fleets, contractors, excavation, landscaping, and site development teams.",
      },
      {
        path: "/process",
        title: "How It Works | AM Consulting LLC",
        description:
          "Consultation, assessment, dispatch coordination, and follow-up — a clear process from first call to final load.",
      },
      {
        path: "/quote",
        title: "Request a Quote | AM Consulting LLC",
        description: "Request dispatch or hauling coordination for your project.",
      },
      {
        path: "/contact",
        title: "Contact | AM Consulting LLC",
        description: "Talk with our hauling logistics team.",
      },
      {
        path: "/drivers",
        title: "Driver Registration | AM Consulting LLC",
        description: "Owner-operators and dump truck fleets — register with our dispatch team.",
      },
      {
        path: "/faq",
        title: "FAQs | AM Consulting LLC",
        description:
          "Answers to common questions about our dispatching and hauling coordination services.",
      },
    ],
  },
  ...LEGAL_DEFAULTS,
};

export type ContentKey = keyof typeof DEFAULT_CONTENT;
export type SiteContent = { [K in ContentKey]: (typeof DEFAULT_CONTENT)[K] };
