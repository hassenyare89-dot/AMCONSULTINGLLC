import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test.describe("form validation (client)", () => {
  test("contact form reports and focuses invalid fields", async ({ page }) => {
    await gotoReady(page, "/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("alert")).toContainText("Please fix the highlighted fields");
    await expect(page.locator("#fld-name")).toBeFocused();
    await expect(page.locator("#fld-name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Please acknowledge the privacy notice")).toBeVisible();
    await expect(page.getByText("Phone number is required")).toBeVisible();
  });

  test("driver registration validates USDOT digits and required fields", async ({ page }) => {
    await gotoReady(page, "/drivers");
    await page.locator("#fld-dotNumber").fill("12AB");
    await page.getByRole("button", { name: "Submit registration" }).click();
    await expect(page.getByText("USDOT number must be digits only")).toBeVisible();
    await expect(page.getByText("Owner / driver name is required")).toBeVisible();
    await expect(page.getByText("Enter the address or city where the truck is now")).toBeVisible();
    await expect(page.getByText("Select at least one Georgia county")).toBeVisible();
    await expect(page.getByText("Select the CDL class")).toBeVisible();
    await expect(page.getByText("W-9: please attach this document.")).toBeVisible();
    await expect(page.getByText("Select at least one truck type")).toBeVisible();
    await expect(page.getByText("Select your availability")).toBeVisible();
    await expect(page.getByText(/confirm your truck is insured, registered/)).toBeVisible();
    // focus moves to the first invalid field
    await expect(page.locator("#fld-ownerName")).toBeFocused();
  });

  test("Georgia county picker searches and selects several counties", async ({ page }) => {
    await gotoReady(page, "/drivers");
    const box = page.locator("#fld-counties");
    await box.fill("gwin");
    await page.getByRole("option", { name: "Gwinnett County" }).click();
    await box.fill("cob");
    await box.press("Enter");
    const chips = page.getByRole("list", { name: "Selected counties" });
    await expect(chips).toContainText("Gwinnett");
    await expect(chips).toContainText("Cobb");
    await page.getByRole("button", { name: "Remove Gwinnett County" }).click();
    await expect(chips).not.toContainText("Gwinnett");
    await expect(page.locator('input[type=hidden][name="counties"]')).toHaveCount(1);
  });

  test("quote form requires consent", async ({ page }) => {
    await gotoReady(page, "/quote");
    await page.locator("#fld-name").fill("Pat Doe");
    await page.locator("#fld-email").fill("pat@example.com");
    await page.locator("#fld-serviceType").selectOption("hauling-logistics");
    await page.locator("#fld-pickupLocation").fill("100 Peachtree St, Atlanta, GA");
    await page.getByRole("button", { name: "Submit quote request" }).click();
    await expect(page.getByText("Please acknowledge the privacy notice")).toBeVisible();
  });

  test("contact page map loads only after consent click", async ({ page }) => {
    await gotoReady(page, "/contact");
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByRole("button", { name: "Show map" }).click();
    await expect(page.locator('iframe[title^="Map of"]')).toHaveCount(1);
  });
});

test.describe("public API hardening", () => {
  const valid = {
    name: "E2E",
    email: "e2e@example.com",
    phone: "404-555-0100",
    message: "hello",
    website: "",
    ts: Date.now() - 10_000,
  };

  test("rejects cross-origin POSTs", async ({ request }) => {
    const r = await request.post("/api/public/contact", {
      data: valid,
      headers: { origin: "https://evil.example" },
    });
    expect(r.status()).toBe(403);
  });
  test("rejects malformed JSON and invalid fields with safe messages", async ({ request }) => {
    const bad = await request.post("/api/public/contact", {
      data: "{not json",
      headers: { "content-type": "application/json" },
    });
    expect(bad.status()).toBe(400);
    const invalid = await request.post("/api/public/contact", { data: { ...valid, email: "x" } });
    expect(invalid.status()).toBe(400);
    const body = await invalid.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/stack|supabase|postgres/i);
  });
  test("honeypot submissions are silently accepted and not processed", async ({ request }) => {
    const r = await request.post("/api/public/contact", {
      data: { ...valid, website: "", ts: Date.now() },
    });
    expect(r.status()).toBe(200);
    expect((await r.json()).ref).toBe("RECEIVED");
  });
  test("oversized payloads are refused", async ({ request }) => {
    const r = await request.post("/api/public/contact", {
      data: { ...valid, message: "x".repeat(70_000) },
    });
    expect(r.status()).toBe(400);
  });
  test("driver status rejects malformed tokens without leaking data", async ({ request }) => {
    const r = await request.get("/api/public/driver-status?token=../../etc");
    expect(r.status()).toBe(404);
    const r2 = await request.get("/api/public/driver-status?id=not-a-uuid&email=a@b.co");
    expect(r2.status()).toBe(400);
  });
  test("cron endpoint requires its secret", async ({ request }) => {
    const r = await request.post("/api/cron/maintenance", {
      headers: { authorization: "Bearer guess" },
    });
    expect([401, 503]).toContain(r.status());
  });
  test("upload endpoint requires authentication", async ({ request }) => {
    const r = await request.post("/api/admin/upload", { multipart: { target: "media" } });
    expect(r.status()).toBe(401);
  });
  test("admin RPC rejects anonymous callers", async ({ page }) => {
    await gotoReady(page, "/");
    const status = await page.evaluate(async () => {
      const mod = await import("/src/lib/api/rpc.functions.ts");
      try {
        await (mod as any).adminRpc({
          data: { op: "resource.list", input: { resource: "leads" } },
        });
        return "allowed";
      } catch (e) {
        return String((e as Error).message);
      }
    });
    expect(status).not.toBe("allowed");
    expect(status).toMatch(/unauthori[sz]ed|sign in/i);
  });
});

test.describe("headers, SEO and admin protection", () => {
  test("security headers are present", async ({ request }) => {
    const r = await request.get("/");
    const h = r.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
  test("admin and auth are not indexable", async ({ request }) => {
    const r = await request.get("/admin");
    expect(r.headers()["x-robots-tag"]).toContain("noindex");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /admin");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("<loc>https://amconsultingllc.net/services/load-coordination</loc>");
    expect(sitemap).not.toContain("/admin");
  });
  test("unauthenticated visitors are redirected from /admin to sign-in (no sign-up offered)", async ({
    page,
  }) => {
    await gotoReady(page, "/admin");
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
    await expect(page.getByText(/create account|sign up/i)).toHaveCount(0);
  });
  test("structured data is valid JSON with business details", async ({ page }) => {
    await gotoReady(page, "/");
    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}",
    );
    expect(ld["@type"]).toBe("ProfessionalService");
    expect(ld.address.addressLocality).toBe("Stone Mountain");
  });
});
