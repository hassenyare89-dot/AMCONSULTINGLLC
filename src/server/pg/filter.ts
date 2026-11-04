/**
 * Parser for the PostgREST-style filter strings the services use with `.or()` and `.not()`,
 * e.g. `owner_name.ilike.%acme%,email.eq.a@b.co` or `audience_permission.in.("a","b")`.
 * Produces structured conditions; the query builder turns them into parameterised SQL.
 */
export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "in";
export type Condition = { column: string; op: FilterOp; value: unknown };

const OPS = new Set<FilterOp>(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"]);
export const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Splits on commas that are not inside parentheses or double quotes. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "(") depth++;
    else if (!quoted && ch === ")") depth--;
    if (ch === "," && depth === 0 && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Parses `(a,b)` or `("a","b")` into a string array. */
export function parseList(raw: string): string[] {
  const inner = raw.trim().replace(/^\(/, "").replace(/\)$/, "");
  if (!inner) return [];
  return splitTopLevel(inner).map((v) => v.trim().replace(/^"(.*)"$/, "$1"));
}

export function parseValue(op: FilterOp, raw: string): unknown {
  if (op === "in") return parseList(raw);
  if (op === "is") {
    const v = raw.toLowerCase();
    if (v === "null") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    throw new Error(`Unsupported IS value: ${raw}`);
  }
  return raw;
}

export function parseCondition(expr: string): Condition {
  const first = expr.indexOf(".");
  const second = first < 0 ? -1 : expr.indexOf(".", first + 1);
  if (first < 0 || second < 0) throw new Error(`Invalid filter expression: ${expr}`);
  const column = expr.slice(0, first).trim();
  const op = expr.slice(first + 1, second).trim() as FilterOp;
  const raw = expr.slice(second + 1);
  if (!IDENT.test(column)) throw new Error(`Invalid filter column: ${column}`);
  if (!OPS.has(op)) throw new Error(`Unsupported filter operator: ${op}`);
  return { column, op, value: parseValue(op, raw) };
}

/** Parses a comma-separated OR filter list. */
export function parseOrFilter(filter: string): Condition[] {
  const parts = splitTopLevel(filter)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("Empty OR filter");
  return parts.map(parseCondition);
}
