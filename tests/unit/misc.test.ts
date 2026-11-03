import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { buildResourceSchema, sanitizeSearchTerm } from "@/lib/shared/resource-schema";
import { RESOURCES } from "@/lib/shared/resources";
import { CMS_SECTIONS, cmsSectionSchema, getCmsSection } from "@/lib/shared/cms-schema";
import { DEFAULT_CONTENT } from "@/lib/content/defaults";
import { decodeError, encodeError, AppError } from "@/lib/shared/errors";
import { passwordProblems } from "@/lib/shared/password";
import { diff, redactChanges } from "@/server/audit.server";
import { classifyDocument, classifyMedia, sniff } from "@/server/services/files.server";
import { chooseHeroMode } from "@/components/site/Hero";

describe("resource schemas", () => {
  it("strips unknown and server-managed fields (mass-assignment protection)", () => {
    const s = buildResourceSchema(RESOURCES.leads, "create");
    expect(s.safeParse({ name: "A", is_admin: true }).success).toBe(false);
    expect(
      buildResourceSchema(RESOURCES.contact_submissions, "update").safeParse({ message: "edited" })
        .success,
    ).toBe(false);
  });
  it("validates types, enums and patterns", () => {
    const t = buildResourceSchema(RESOURCES.trucks, "create");
    expect(
      t.safeParse({
        unit_number: "t-1",
        vehicle_type: "tandem",
        availability: "available",
        vin: "1HGCM82633A004352",
      }).success,
    ).toBe(true);
    expect(
      t.safeParse({ unit_number: "t-1", vehicle_type: "tank", availability: "available" }).success,
    ).toBe(false);
    expect(
      t.safeParse({
        unit_number: "t-1",
        vehicle_type: "tandem",
        availability: "available",
        vin: "IOQ",
      }).success,
    ).toBe(false);
    const parsed = t.parse({
      unit_number: "t-1",
      vehicle_type: "tandem",
      availability: "available",
      license_plate: "abc123",
      year: "2020",
    });
    expect(parsed.unit_number).toBe("T-1");
    expect(parsed.year).toBe(2020);
  });
  it("empty optional values become null; required are enforced", () => {
    const s = buildResourceSchema(RESOURCES.customers, "create");
    expect(s.parse({ name: "C", email: "" }).email).toBeNull();
    expect(s.safeParse({ email: "c@example.com" }).success).toBe(false);
  });
  it("search terms cannot inject PostgREST filter syntax", () => {
    expect(sanitizeSearchTerm("a,b),or(id.eq.1")).not.toMatch(/[,()]/);
    expect(sanitizeSearchTerm("x".repeat(500)).length).toBe(80);
  });
});

describe("CMS content model", () => {
  it("every default section validates against its schema", () => {
    for (const def of CMS_SECTIONS) {
      const r = cmsSectionSchema(def).safeParse(
        (DEFAULT_CONTENT as Record<string, unknown>)[def.key],
      );
      expect(r.success, `${def.key}: ${!r.success && JSON.stringify(r.error.issues[0])}`).toBe(
        true,
      );
    }
  });
  it("rejects javascript: URLs and unknown fields", () => {
    const hero = getCmsSection("home.hero")!;
    expect(
      cmsSectionSchema(hero).safeParse({ primaryCtaHref: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(cmsSectionSchema(hero).safeParse({ evil: 1 }).success).toBe(false);
  });
  it("default highlights are not shown until verified", () => {
    expect(DEFAULT_CONTENT["home.highlights"].items.every((i) => !i.verified)).toBe(true);
  });
});

describe("errors survive serialization", () => {
  it("round-trips safe codes and hides internals", () => {
    const e = decodeError(new Error(encodeError(new AppError("CONFLICT", "Booked", { a: 1 }))));
    expect(e).toEqual({ code: "CONFLICT", message: "Booked", details: { a: 1 } });
    expect(decodeError(new Error("relation x does not exist")).code).toBe("INTERNAL");
  });
});

describe("password policy", () => {
  it("enforces length and blocks obvious choices", () => {
    expect(passwordProblems("short")).not.toHaveLength(0);
    expect(passwordProblems("password123")).not.toHaveLength(0);
    expect(passwordProblems("dispatcher-jane-2030", "jane@example.com")).toContain(
      "Don't include your email name in the password.",
    );
    expect(passwordProblems("correct horse battery staple")).toEqual([]);
  });
});

describe("audit redaction", () => {
  it("masks sensitive identifiers and diffs only changed fields", () => {
    expect(redactChanges({ vin: "1HGCM82633A004352", make: "Mack" })).toEqual({
      vin: "[redacted]",
      make: "Mack",
    });
    expect(diff({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: { from: 2, to: 3 } });
  });
});

describe("upload content sniffing", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const pdf = new TextEncoder().encode("%PDF-1.7\n...");
  const html = new TextEncoder().encode("<html><script>alert(1)</script>");
  it("identifies real types regardless of filename", () => {
    expect(sniff(png)?.mime).toBe("image/png");
    expect(classifyMedia(png).kind).toBe("image");
    expect(classifyDocument(pdf, "x.exe").mime).toBe("application/pdf");
  });
  it("rejects disguised or unsupported files", () => {
    expect(() => classifyMedia(html)).toThrow();
    expect(() => classifyDocument(html, "invoice.pdf")).toThrow();
    expect(() => classifyDocument(new Uint8Array([0x4d, 0x5a, 0x90, 0]), "tool.txt")).toThrow();
  });
  it("accepts plain text/CSV only by extension when content is text", () => {
    expect(classifyDocument(new TextEncoder().encode("a,b\n1,2"), "loads.csv").mime).toBe(
      "text/csv",
    );
  });
});

describe("hero background selection", () => {
  const env = { reducedMotion: false, saveData: false, webgl: true, width: 1440, cores: 8 };
  it("uses 3D on capable desktops, video on phones, image for reduced motion", () => {
    expect(chooseHeroMode("auto", env)).toBe("3d");
    expect(chooseHeroMode("auto", { ...env, width: 390 })).toBe("video");
    expect(chooseHeroMode("auto", { ...env, reducedMotion: true })).toBe("image");
    expect(chooseHeroMode("auto", { ...env, saveData: true, width: 390 })).toBe("image");
    expect(chooseHeroMode("3d", { ...env, webgl: false })).toBe("video");
    expect(chooseHeroMode("video", env)).toBe("video");
    expect(chooseHeroMode("image", env)).toBe("image");
  });
});
