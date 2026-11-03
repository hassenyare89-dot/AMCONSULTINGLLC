// Visits every route in a real browser so the dev server compiles all modules before E2E tests.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:4173";
const paths = ["/", "/about", "/services", "/services/load-coordination", "/who-we-serve", "/process", "/quote", "/book", "/drivers", "/drivers/status", "/faq", "/contact", "/privacy", "/terms", "/accessibility", "/cookies", "/privacy/request", "/auth", "/auth/reset", "/admin"];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const p of paths) {
  const t = Date.now();
  await page.goto(base + p);
  await page.waitForSelector("html[data-hydrated='true']", { timeout: 120000 }).catch(() => console.log("  (no hydration marker)"));
  console.log(p, Date.now() - t, "ms");
}
await browser.close();
