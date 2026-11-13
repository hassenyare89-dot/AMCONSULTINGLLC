import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

const PAGES = [
  "/",
  "/about",
  "/services",
  "/services/load-coordination",
  "/who-we-serve",
  "/process",
  "/quote",
  "/book",
  "/drivers",
  "/drivers/status",
  "/faq",
  "/contact",
  "/privacy",
  "/accessibility",
  "/privacy/request",
  "/auth",
];

test.describe("accessibility (axe, WCAG 2.2 AA rules)", () => {
  for (const path of PAGES) {
    test(`${path} has no detectable WCAG A/AA violations`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await gotoReady(page, path);
      await page.waitForTimeout(800); // let entrance animations settle
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const summary = results.violations.map(
        (v) => `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes[0]?.target.join(" ")}`,
      );
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }
});

test.describe("motion preferences", () => {
  test("reduced motion shows a static hero image with no video or WebGL", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoReady(page, "/");
    await page.waitForTimeout(1500);
    await expect(page.locator("#home img").first()).toBeVisible();
    await expect(page.locator("#home video")).toHaveCount(0);
    await expect(page.locator("#home canvas")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Pause background/ })).toHaveCount(0);
  });

  test("hero video has a keyboard-only pause control (WCAG 2.2.2)", async ({ page }) => {
    await gotoReady(page, "/");
    const video = page.locator("#home video");
    await expect(video).toHaveCount(1);
    const pause = page.getByRole("button", { name: "Pause background video" });
    // Not shown on top of the video for mouse/touch visitors…
    await expect(pause).toHaveClass(/sr-only/);
    expect((await pause.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
    // …but reachable and visible for keyboard users, and it really pauses the video.
    await pause.focus();
    expect((await pause.boundingBox())?.width ?? 0).toBeGreaterThan(40);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Play background video" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  });
});

test.describe("cookie notice", () => {
  test("shows on first visit, links to the policies, and stays dismissed after Accept", async ({
    page,
  }) => {
    await gotoReady(page, "/", { cookieNotice: true });
    const notice = page.getByRole("region", { name: "Cookie notice" });
    await expect(notice).toBeVisible();
    await expect(notice.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(notice.getByRole("link", { name: "Cookie Policy" })).toHaveAttribute(
      "href",
      "/cookies",
    );
    const results = await new AxeBuilder({ page })
      .include('[aria-label="Cookie notice"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await notice.getByRole("button", { name: "Accept" }).click();
    await expect(notice).toHaveCount(0);
    await page.reload();
    await page.waitForSelector("html[data-hydrated='true']");
    await expect(page.getByRole("region", { name: "Cookie notice" })).toHaveCount(0);
  });

  test("published legal pages carry no draft notices", async ({ page }) => {
    for (const path of ["/privacy", "/terms", "/cookies", "/accessibility"]) {
      await gotoReady(page, path);
      const text = await page.locator("main").innerText();
      expect(text, path).not.toMatch(/draft|\[confirm|to be verified|counsel to/i);
    }
    await gotoReady(page, "/privacy");
    await expect(page.getByRole("heading", { name: /Children/ })).toHaveCount(0);
    await expect(page.getByText("Last updated: November 13, 2026")).toBeVisible();
  });
});
