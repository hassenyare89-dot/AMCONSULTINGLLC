import { FilterXSS } from "xss";

/**
 * Allow-list HTML sanitizer for CMS rich text. Runs on the server when content is saved and
 * again when it is rendered, so stored XSS is blocked even if a row is edited directly in SQL.
 */
const filter = new FilterXSS({
  whiteList: {
    p: [],
    br: [],
    strong: [],
    b: [],
    em: [],
    i: [],
    u: [],
    s: [],
    h2: [],
    h3: [],
    h4: [],
    blockquote: [],
    code: [],
    pre: [],
    hr: [],
    ul: [],
    ol: [],
    li: [],
    a: ["href", "title", "target", "rel"],
    table: [],
    thead: [],
    tbody: [],
    tr: [],
    th: ["scope"],
    td: [],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed", "svg", "math", "template"],
  onTagAttr(tag, name, value) {
    if (tag === "a" && name === "href") {
      const v = value.trim();
      if (/^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(v)) return `href="${escapeAttr(v)}"`;
      return "";
    }
    if (tag === "a" && name === "target")
      return value === "_blank" ? 'target="_blank" rel="noopener noreferrer"' : "";
    return undefined;
  },
});

function escapeAttr(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function sanitizeHtml(html: string): string {
  return filter.process(html ?? "");
}

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text → safe paragraphs HTML (used when an editor types plain text into a rich field). */
export function textToHtml(text: string): string {
  return String(text ?? "")
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Accepts only site-relative or http(s) URLs; anything else becomes "#". */
export function safeUrl(url: string | null | undefined): string {
  const v = (url ?? "").trim();
  if (/^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v) || /^mailto:|^tel:/i.test(v)) return v;
  return "#";
}
