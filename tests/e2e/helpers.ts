import type { Page } from "@playwright/test";

/** Navigates and waits until React has hydrated (the app sets html[data-hydrated]). */
export async function gotoReady(page: Page, path: string) {
  const res = await page.goto(path);
  await page.waitForSelector("html[data-hydrated='true']", { timeout: 30_000 });
  return res;
}
