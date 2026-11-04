import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCondition, parseOrFilter } from "@/server/pg/filter";
import { createDb } from "@/server/pg/query";
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from "@/server/auth/totp";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { open, seal } from "@/server/auth/crypto-box.server";
import * as storage from "@/server/storage.server";
import { readSessionToken, sessionCookie } from "@/server/auth/cookie.server";

const sqlOf = (q: { toSQL(): { sql: string; params: unknown[] } }) => q.toSQL();
const d = createDb(async () => ({ rows: [] }));

describe("filter parser", () => {
  it("parses conditions and lists", () => {
    expect(parseCondition("name.ilike.%acme%")).toEqual({
      column: "name",
      op: "ilike",
      value: "%acme%",
    });
    expect(parseCondition("stage.in.(won,lost)")).toEqual({
      column: "stage",
      op: "in",
      value: ["won", "lost"],
    });
    expect(parseCondition("archived_at.is.null")).toEqual({
      column: "archived_at",
      op: "is",
      value: null,
    });
    expect(parseOrFilter("name.ilike.%a%,email.eq.b")).toHaveLength(2);
  });
  it("rejects injection attempts in column names and operators", () => {
    expect(() => parseCondition('name";drop table x;--.eq.1')).toThrow();
    expect(() => parseCondition("name.raw.1")).toThrow();
  });
});

describe("query builder", () => {
  it("parameterises every value", () => {
    const { sql, params } = sqlOf(
      d
        .from("leads")
        .select("id,name")
        .eq("stage", "new")
        .ilike("email", "a@b.c")
        .in("id", ["1", "2"])
        .order("created_at", { ascending: false })
        .range(0, 9),
    );
    expect(sql).toBe(
      'SELECT "id", "name" FROM "leads" WHERE "stage" = $1 AND "email"::text ILIKE $2 AND "id"::text = ANY($3::text[]) ORDER BY "created_at" DESC NULLS FIRST LIMIT 10 OFFSET 0',
    );
    expect(params).toEqual(["new", "a@b.c", ["1", "2"]]);
  });
  it("supports or / is / not in", () => {
    const { sql, params } = sqlOf(
      d
        .from("leads")
        .select("id")
        .or("name.ilike.%x%,email.eq.y")
        .is("archived_at", null)
        .not("stage", "in", "(won,lost)")
        .limit(1),
    );
    expect(sql).toBe(
      'SELECT "id" FROM "leads" WHERE ("name"::text ILIKE $1 OR "email" = $2) AND "archived_at" IS NULL AND NOT ("stage"::text = ANY($3::text[])) LIMIT 1',
    );
    expect(params).toEqual(["%x%", "y", ["won", "lost"]]);
  });
  it("builds upserts and JSON updates", () => {
    expect(
      sqlOf(
        d.from("user_roles").upsert([{ user_id: "u", role: "a" }], {
          onConflict: "user_id,role",
          ignoreDuplicates: true,
        }),
      ).sql,
    ).toBe(
      'INSERT INTO "user_roles" ("user_id", "role") VALUES ($1, $2) ON CONFLICT ("user_id", "role") DO NOTHING',
    );
    const u = sqlOf(
      d
        .from("leads")
        .update({ meta: { a: 1 } })
        .eq("id", "x")
        .select("id"),
    );
    expect(u.sql).toBe('UPDATE "leads" SET "meta" = $1 WHERE "id" = $2 RETURNING "id"');
    expect(u.params).toEqual(['{"a":1}', "x"]);
  });
  it("refuses unfiltered updates and deletes", async () => {
    const r = await d.from("leads").delete();
    expect(r.error).not.toBeNull();
  });
  it("rejects unsafe identifiers", () => {
    expect(() => sqlOf(d.from('leads"; drop table leads; --').select("id"))).toThrow();
  });
});

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 Appendix B, SHA-1, secret "12345678901234567890", 8 digits.
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC test vectors", () => {
    expect(hotp(base32Decode(secret), 1, 8)).toBe("94287082"); // T = 59s
    expect(hotp(base32Decode(secret), 37037036, 8)).toBe("07081804"); // T = 1111111109s
    expect(totp(secret, 59_000)).toBe("287082");
  });
  it("accepts ±1 step and blocks replay", () => {
    const now = 1_700_000_000_000;
    const code = totp(secret, now);
    const counter = verifyTotp(secret, code, null, now + 30_000);
    expect(counter).not.toBeNull();
    expect(verifyTotp(secret, code, counter, now)).toBeNull(); // same step reused
    expect(verifyTotp(secret, totp(secret, now), null, now + 120_000)).toBeNull(); // too old
  });
});

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const h = await hashPassword("Correct-Horse-Battery-42!");
    expect(h).not.toContain("Correct");
    expect(await verifyPassword("Correct-Horse-Battery-42!", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });
});

describe("sealed secrets", () => {
  it("round-trips and detects tampering", () => {
    const s = seal("JBSWY3DPEHPK3PXP");
    expect(s.startsWith("v1.")).toBe(true);
    expect(open(s)).toBe("JBSWY3DPEHPK3PXP");
    const parts = s.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => open(parts.join("."))).toThrow();
  });
});

describe("local file storage", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "amcms-store-"));
    process.env.STORAGE_DIR = dir;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("stores, reads and never overwrites", async () => {
    await storage.putObject("media", "image/2026-11/a.png", new Uint8Array([1, 2, 3]));
    expect(await storage.readObject("media", "image/2026-11/a.png")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await expect(
      storage.putObject("media", "image/2026-11/a.png", new Uint8Array([9])),
    ).rejects.toThrow();
  });
  it("blocks path traversal", () => {
    for (const bad of ["../x", "a/../../x", "/etc/passwd", "a//b", ".hidden/x", "a\\b"])
      expect(() => storage.resolvePath("media", bad)).toThrow();
  });
  it("signs private document links and rejects tampering or expiry", () => {
    const url = new URL(
      storage.signedDocumentUrl("company/general/f.pdf", 60, "f.pdf"),
      "http://x",
    );
    const q = url.searchParams;
    const rel = url.pathname.replace("/files/documents/", "");
    expect(storage.verifyDocumentSignature(rel, q.get("exp"), q.get("dl"), q.get("sig"))).toBe(
      true,
    );
    expect(
      storage.verifyDocumentSignature(
        "company/general/other.pdf",
        q.get("exp"),
        q.get("dl"),
        q.get("sig"),
      ),
    ).toBe(false);
    expect(storage.verifyDocumentSignature(rel, "1", q.get("dl"), q.get("sig"))).toBe(false);
  });
});

describe("session cookie", () => {
  it("is HttpOnly + SameSite and parsed back", () => {
    const req = new Request("https://amconsultingllc.net/");
    const c = sessionCookie(req, "tok_abc");
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Secure/);
    const back = new Request("https://amconsultingllc.net/", {
      headers: { cookie: `x=1; ${c.split(";")[0]}` },
    });
    expect(readSessionToken(back)).toBe("tok_abc");
  });
});
