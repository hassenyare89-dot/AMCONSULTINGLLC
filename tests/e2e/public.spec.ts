import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

const PAGES: [string, RegExp][] = [
  ["/", /Dump Truck Dispatching/i],
  ["/about", /About AM Consulting/i],
  ["/services", /Dispatching, hauling/i],
  ["/services/dump-truck-dispatching", /Dump Truck Dispatching/i],
  ["/who-we-serve", /Built for hauling/i],
  ["/process", /four-step process/i],
  ["/quote", /hauling needs/i],
  ["/book", /Book a consultation/i],
  ["/drivers", /Dump Truck Registration/i],
  ["/drivers/status", /Application status/i],
  ["/faq", /Frequently asked questions/i],
  ["/contact", /Contact our team/i],
  ["/privacy", /Privacy Policy/i],
  ["/terms", /Terms of Use/i],
  ["/accessibility", /Accessibility Statement/i],
  ["/cookies", /Cookie Policy/i],
  ["/privacy/request", /Privacy request/i],
];

test.describe("public pages", () => {
  for (const [path, h1] of PAGES) {
    test(`${path} renders a single h1 and title`, async ({ page }) => {
      const res = await gotoReady(page, path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(h1);
      await expect(page).toHaveTitle(/AM Consulting LLC/);
      const robotsMeta = page.locator('meta[name="robots"]');
      const robots = (await robotsMeta.count())
        ? await robotsMeta.first().getAttribute("content")
        : null;
      if (!robots?.includes("noindex"))
        expect(await page.locator('link[rel="canonical"]').last().getAttribute("href")).toMatch(
          /^https:\/\/amconsultingllc\.net/,
        );
    });
  }

  test("unknown service slug returns 404", async ({ page }) => {
    const res = await page.goto("/services/not-a-service");
    expect(res?.status()).toBe(404);
  });

  test("homepage hero shows required headline and working CTAs", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Professional Dump Truck Dispatching & Hauling Consulting Services",
    );
    await expect(
      page.locator("#home").getByText("Keeping Trucks Moving. Keeping Projects On Schedule."),
    ).toBeVisible();
    await expect(
      page.locator("#home").getByRole("link", { name: "Request Dispatch Services" }),
    ).toHaveAttribute("href", "/quote");
    await expect(
      page.locator("#home").getByRole("link", { name: "Register Your Truck" }),
    ).toHaveAttribute("href", "/drivers");
    await expect(
      page.locator("#home").getByRole("link", { name: "Contact Our Team" }),
    ).toHaveAttribute("href", "/contact");
    // Unverified statistics from the original site must not appear.
    await expect(page.getByText(/98%|500\+|Active Loads Today/)).toHaveCount(0);
  });

  test("skip link moves focus to main content", async ({ page }) => {
    await gotoReady(page, "/about");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("footer shows legal links and hides empty social links", async ({ page }) => {
    await gotoReady(page, "/");
    const footer = page.locator("footer");
    for (const l of ["Privacy Policy", "Terms of Use", "Accessibility", "Cookie Policy"])
      await expect(footer.getByRole("link", { name: l })).toBeVisible();
    await expect(footer.locator('a[href="#"]')).toHaveCount(0);
  });

  test("FAQ page shows an empty state when no FAQs are published", async ({ page }) => {
    await gotoReady(page, "/faq");
    await expect(page.getByText(/being prepared/)).toBeVisible();
  });
});

test.describe("navigation", () => {
  test("primary navigation reaches each section", async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), "desktop nav");
    await gotoReady(page, "/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Services" }).click();
    await expect(page).toHaveURL(/\/services$/);
    await nav.getByRole("link", { name: "How It Works" }).click();
    await expect(page).toHaveURL(/\/process$/);
    await expect(nav.getByRole("link", { name: "How It Works" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("mobile menu opens, navigates, and closes with Escape", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile nav");
    await gotoReady(page, "/");
    const toggle = page.getByRole("button", { name: "Open navigation menu" });
    await toggle.click();
    await expect(page.getByRole("button", { name: "Close navigation menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const menu = page.getByRole("navigation", { name: "Mobile primary" });
    await menu.getByRole("link", { name: "FAQs" }).click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(menu).toBeHidden();
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("no horizontal overflow on key pages", async ({ page }) => {
    for (const p of ["/", "/contact", "/quote", "/drivers", "/book"]) {
      await gotoReady(page, p);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, p).toBeLessThanOrEqual(1);
    }
  });
});
