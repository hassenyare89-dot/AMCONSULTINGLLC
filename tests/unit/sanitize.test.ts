import { describe, expect, it } from "vitest";
import { safeUrl, sanitizeHtml, textToHtml } from "@/lib/shared/sanitize";

describe("CMS HTML sanitizer (stored XSS prevention)", () => {
  const cases = [
    '<img src=x onerror="alert(1)">',
    "<script>alert(1)</script>",
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<p onclick="alert(1)">hi</p>',
    '<iframe src="https://evil.example"></iframe>',
    "<svg><script>alert(1)</script></svg>",
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    "<style>body{background:url(javascript:alert(1))}</style>",
    '<p style="background:url(javascript:alert(1))">x</p>',
  ];
  for (const c of cases) {
    it(`neutralises ${c.slice(0, 40)}`, () => {
      const out = sanitizeHtml(c).toLowerCase();
      expect(out).not.toMatch(
        /<script|onerror|onclick|javascript:|<iframe|<svg|data:text|<style|style=/,
      );
    });
  }
  it("keeps allowed formatting and safe links", () => {
    const out = sanitizeHtml(
      '<h2>Title</h2><p><strong>b</strong> <a href="/privacy">p</a> <a href="https://x.example" target="_blank">e</a></p><ul><li>x</li></ul>',
    );
    expect(out).toContain("<h2>Title</h2>");
    expect(out).toContain('<a href="/privacy">');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("<li>x</li>");
  });
  it("escapes plain text", () => {
    expect(textToHtml("a<b>\n\nc")).toBe("<p>a&lt;b&gt;</p><p>c</p>");
  });
  it("safeUrl blocks dangerous schemes and protocol-relative URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("//evil.example")).toBe("#");
    expect(safeUrl("/quote")).toBe("/quote");
    expect(safeUrl("https://amconsultingllc.net")).toBe("https://amconsultingllc.net");
    expect(safeUrl("tel:+14048620305")).toBe("tel:+14048620305");
  });
});
