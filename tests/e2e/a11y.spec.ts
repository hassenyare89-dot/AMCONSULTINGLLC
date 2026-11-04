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

  test("animated hero exposes a pause control that persists", async ({ page }) => {
    await gotoReady(page, "/");
    // The bundled landing video plays by default on every viewport.
    await expect(page.locator("#home video")).toHaveCount(1);
    const pause = page.getByRole("button", { name: /Pause background/ });
    await expect(pause).toBeVisible({ timeout: 15000 });
    await pause.click();
    await expect(page.getByRole("button", { name: /Play background/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.reload();
    await expect(page.getByRole("button", { name: /Play background/ })).toBeVisible({
      timeout: 15000,
    });
  });
});
