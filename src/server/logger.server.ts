/** Structured JSON logging. Never pass secrets, tokens, passwords, or full personal records. */
type Level = "debug" | "info" | "warn" | "error";
const REDACT = /pass(word)?|token|secret|authorization|cookie|api[-_]?key/i;

function scrub(v: unknown, depth = 0): unknown {
  if (depth > 4 || v == null) return v;
  if (v instanceof Error) return { name: v.name, message: v.message };
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => scrub(x, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>))
      out[k] = REDACT.test(k) ? "[redacted]" : scrub(val, depth + 1);
    return out;
  }
  return v;
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(scrub(fields) as object),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
