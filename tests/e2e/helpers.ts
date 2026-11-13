import type { Page } from "@playwright/test";
import { PRIVACY_POLICY_VERSION } from "../../src/lib/shared/domain";

/** Navigates and waits until React has hydrated (the app sets html[data-hydrated]). */
export async function gotoReady(page: Page, path: string, opts: { cookieNotice?: boolean } = {}) {
  // Most tests pre-accept the cookie notice so it doesn't sit over the controls they click.
  if (!opts.cookieNotice) await acceptCookies(page);
  const res = await page.goto(path);
  await page.waitForSelector("html[data-hydrated='true']", { timeout: 30_000 });
  return res;
}

/** Stores an accepted cookie notice for the current policy version before any page loads. */
export async function acceptCookies(page: Page) {
  await page.addInitScript((version) => {
    try {
      localStorage.setItem("amc_cookie_consent", JSON.stringify({ version }));
    } catch {
      /* ignore */
    }
  }, PRIVACY_POLICY_VERSION);
}
