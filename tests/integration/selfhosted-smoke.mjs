#!/usr/bin/env node
/**
 * End-to-end smoke test of the self-hosted stack against a RUNNING server and its database:
 * public form → Postgres, admin provisioning, invite link, password, sign-in, TOTP MFA,
 * an authenticated upload to local storage, public media serving, signed-link rules,
 * sign-out and session revocation.
 *
 *   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://... node tests/integration/selfhosted-smoke.mjs
 *
 * Run automatically by: ./scripts/test-integration.sh
 */
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import pg from "pg";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const email = `owner-${Date.now()}@example.com`;
const password = "Correct-Horse-Battery-42!";
let cookie = "";
let passed = 0;

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name}`);
    throw err;
  }
}

async function call(path, { method = "POST", body, form, withCookie = true } = {}) {
  const headers = { origin: BASE };
  if (withCookie && cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    redirect: "manual",
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0].endsWith("=") ? "" : set.split(";")[0];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text, headers: res.headers };
}

function totpNow(secretB32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretB32.replace(/=+$/, ""))
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function main() {
  await db.connect();
  console.log(`Smoke testing ${BASE}`);

  await step("home page renders", async () => {
    const r = await call("/", { method: "GET" });
    assert.equal(r.status, 200);
    assert.match(r.text, /AM Consulting/);
  });

  await step("contact form is stored in Postgres", async () => {
    const tag = `smoke-${Date.now()}`;
    const r = await call("/api/public/contact", {
      body: {
        name: "Smoke Test",
        email: "smoke@example.com",
        message: tag,
        consentPrivacy: true,
        ts: Date.now() - 10_000,
      },
    });
    assert.equal(r.status, 200, r.text);
    const { rows } = await db.query(
      "SELECT count(*)::int AS n FROM public.contact_submissions WHERE message LIKE '%' || $1 || '%'",
      [tag],
    );
    assert.equal(rows[0].n, 1);
  });

  const driverForm = (extra = {}) => {
    const fd = new FormData();
    const fields = {
      ownerName: "Smoke Driver",
      companyName: "Peach Haulers LLC",
      email: "driver@example.com",
      phone: "404-555-0101",
      dotNumber: "1234567",
      mcNumber: "",
      truckCount: "2",
      payloadCapacity: "15",
      payloadUnit: "tons",
      serviceArea: "Fulton, DeKalb, Gwinnett",
      currentLocation: "Marietta",
      cdlClass: "A",
      insuranceActive: "yes",
      travelRadius: "50",
      notes: "",
      attestGeorgia: "true",
      consentPrivacy: "true",
      ts: String(Date.now() - 10_000),
      ...extra,
    };
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    for (const t of ["tandem", "tri-axle"]) fd.append("truckTypes", t);
    for (const a of ["weekdays", "weekends"]) fd.append("availability", a);
    for (const m of ["gravel", "crush-and-run"]) fd.append("materials", m);
    return fd;
  };
  // Minimal valid PDF header is enough for content sniffing.
  const pdf = new Blob([Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")], {
    type: "application/pdf",
  });

  await step("driver registration saves all Georgia fields + private documents", async () => {
    const fd = driverForm({ ownerName: "Smoke Driver One" });
    fd.append("docInsurance", pdf, "insurance.pdf");
    fd.append("docW9", pdf, "w9.pdf");
    fd.append("docCdl", new Blob([]), ""); // empty file input is ignored
    const r = await call("/api/public/driver", { form: fd, withCookie: false });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.documents, ["Insurance certificate", "W-9"]);
    const { rows } = await db.query(
      `SELECT dot_number, truck_type, truck_count, payload_capacity, payload_unit, current_location,
              availability, cdl_class, insurance_active, preferred_materials, travel_radius,
              georgia_attested, georgia_attested_at IS NOT NULL AS attested_at
         FROM public.driver_registrations WHERE id = $1`,
      [r.json.id],
    );
    assert.deepEqual(
      { ...rows[0], payload_capacity: Number(rows[0].payload_capacity) },
      {
        dot_number: "1234567",
        truck_type: "tandem,tri-axle",
        truck_count: 2,
        payload_capacity: 15,
        payload_unit: "tons",
        current_location: "Marietta",
        availability: "weekdays,weekends",
        cdl_class: "A",
        insurance_active: true,
        preferred_materials: "gravel,crush-and-run",
        travel_radius: "50",
        georgia_attested: true,
        attested_at: true,
      },
    );
    const docs = await db.query(
      "SELECT category, sensitivity, entity_type, content_type FROM public.documents WHERE entity_id = $1 ORDER BY category, sensitivity",
      [r.json.id],
    );
    assert.deepEqual(docs.rows, [
      {
        category: "driver_registration",
        sensitivity: "restricted",
        entity_type: "driver_application",
        content_type: "application/pdf",
      },
      {
        category: "insurance",
        sensitivity: "confidential",
        entity_type: "driver_application",
        content_type: "application/pdf",
      },
    ]);
    const consent = await db.query(
      "SELECT consent_type FROM public.consent_records WHERE related_id = $1 ORDER BY consent_type",
      [r.json.id],
    );
    assert.deepEqual(
      consent.rows.map((c) => c.consent_type),
      ["georgia_operating_attestation", "privacy_notice"],
    );
  });

  await step("driver registration rejects disguised files and saves nothing", async () => {
    const before = (await db.query("SELECT count(*)::int AS n FROM public.driver_registrations"))
      .rows[0].n;
    const fd = driverForm({ ownerName: "Smoke Driver Two" });
    fd.append(
      "docCdl",
      new Blob(["<html><script>alert(1)</script></html>"], { type: "application/pdf" }),
      "cdl.pdf",
    );
    const r = await call("/api/public/driver", { form: fd, withCookie: false });
    assert.equal(r.status, 400, r.text);
    assert.equal(r.json.details?.field, "docCdl");
    const after = (await db.query("SELECT count(*)::int AS n FROM public.driver_registrations"))
      .rows[0].n;
    assert.equal(after, before);
  });

  await step("driver registration requires the Georgia attestation", async () => {
    const fd = driverForm({ attestGeorgia: "false" });
    const r = await call("/api/public/driver", { form: fd, withCookie: false });
    assert.equal(r.status, 400, r.text);
    assert.match(r.json.error, /authorized to operate in Georgia/);
  });

  await step("admin area requires a session", async () => {
    const r = await call("/api/auth/session", { method: "GET", withCookie: false });
    assert.equal(r.status, 401);
  });

  let link;
  await step("create-admin script provisions a super admin", async () => {
    const out = execFileSync("node", ["scripts/create-admin.mjs", email, "Smoke Owner"], {
      env: { ...process.env, PUBLIC_SITE_URL: BASE },
      encoding: "utf8",
    });
    link = out.match(/(https?:\/\/\S+update-password\?token=\S+)/)?.[1];
    assert.ok(link, out);
  });

  const token = new URL(link).searchParams.get("token");
  await step("weak password is rejected", async () => {
    const r = await call("/api/auth/complete", { body: { token, password: "short" } });
    assert.equal(r.status, 400, r.text);
  });
  await step("invite link sets the password", async () => {
    const r = await call("/api/auth/complete", { body: { token, password } });
    assert.equal(r.status, 200, r.text);
  });
  await step("invite link cannot be reused", async () => {
    const r = await call("/api/auth/complete", { body: { token, password } });
    assert.equal(r.status, 404, r.text);
  });

  await step("wrong password is refused", async () => {
    const r = await call("/api/auth/sign-in", { body: { email, password: "Wrong-password-123!" } });
    assert.equal(r.status, 401, r.text);
  });

  await step("sign-in sets an HttpOnly session cookie", async () => {
    const r = await call("/api/auth/sign-in", { body: { email, password } });
    assert.equal(r.status, 200, r.text);
    const set = r.headers.get("set-cookie") ?? "";
    assert.match(set, /amcms_session=/);
    assert.match(set, /HttpOnly/i);
    assert.match(set, /SameSite=Lax/i);
  });

  await step("cross-origin POST is blocked", async () => {
    const res = await fetch(`${BASE}/api/auth/mfa-enroll`, {
      method: "POST",
      headers: { origin: "https://evil.example", cookie, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 403);
  });

  await step("uploads need MFA first", async () => {
    const fd = new FormData();
    fd.append("target", "media");
    fd.append(
      "file",
      new Blob([Buffer.from("iVBORw0KGgo=", "base64")], { type: "image/png" }),
      "x.png",
    );
    const r = await call("/api/admin/upload", { form: fd });
    assert.equal(r.status, 401, r.text);
    assert.equal(r.json?.code, "MFA_REQUIRED");
  });

  let secret;
  await step("MFA enrolment returns a QR code", async () => {
    const r = await call("/api/auth/mfa-enroll", { body: {} });
    assert.equal(r.status, 200, r.text);
    assert.match(r.json.qrDataUrl, /^data:image\/png;base64,/);
    secret = r.json.secret;
  });
  await step("a wrong TOTP code is refused", async () => {
    const r = await call("/api/auth/mfa-verify", {
      body: { code: "000000" === totpNow(secret) ? "111111" : "000000" },
    });
    assert.equal(r.status, 401, r.text);
  });
  await step("a correct TOTP code upgrades the session", async () => {
    const r = await call("/api/auth/mfa-verify", { body: { code: totpNow(secret) } });
    assert.equal(r.status, 200, r.text);
    const s = await call("/api/auth/session", { method: "GET" });
    assert.equal(s.json.session.aal, "aal2");
    assert.equal(s.json.session.mfaEnabled, true);
  });
  await step("MFA secret is stored encrypted", async () => {
    const { rows } = await db.query(
      "SELECT mfa_secret_enc FROM auth.users WHERE lower(email) = $1",
      [email],
    );
    assert.ok(rows[0].mfa_secret_enc.startsWith("v1."));
    assert.ok(!rows[0].mfa_secret_enc.includes(secret));
  });

  let mediaUrl;
  await step("media upload lands on disk and is served", async () => {
    // 1x1 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const fd = new FormData();
    fd.append("target", "media");
    fd.append("alt", "pixel");
    fd.append("file", new Blob([png], { type: "image/png" }), "pixel.png");
    const r = await call("/api/admin/upload", { form: fd });
    assert.equal(r.status, 200, r.text);
    mediaUrl = r.json.media?.public_url;
    assert.ok(mediaUrl?.startsWith("/files/media/"), JSON.stringify(r.json));
    const got = await fetch(BASE + mediaUrl);
    assert.equal(got.status, 200);
    assert.equal(got.headers.get("content-type"), "image/png");
    assert.equal(Buffer.compare(Buffer.from(await got.arrayBuffer()), png), 0);
  });

  await step("path traversal is rejected", async () => {
    const r = await fetch(`${BASE}/files/media/..%2F..%2Fetc%2Fpasswd`);
    assert.ok([400, 404].includes(r.status), String(r.status));
  });
  await step("unsigned private document links are refused", async () => {
    const r = await fetch(
      `${BASE}/files/documents/company/general/x.pdf?exp=9999999999&dl=x.pdf&sig=forged`,
    );
    assert.equal(r.status, 403);
  });

  await step("sign-out revokes the session server-side", async () => {
    const old = cookie;
    const r = await call("/api/auth/sign-out", { body: {} });
    assert.equal(r.status, 200);
    const res = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: old } });
    assert.equal(res.status, 401);
  });

  if (process.env.SMOKE_BROWSER !== "0") {
    await step("browser: sign in, pass MFA and load the dashboard", async () => {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.goto(`${BASE}/auth`);
        await page.waitForSelector("html[data-hydrated]", { timeout: 15_000 }).catch(() => {});
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("Password").fill(password);
        await page.getByRole("button", { name: "Sign in" }).click();
        await page.getByLabel("Authentication code").waitFor({ timeout: 15_000 });
        // The previous code's time step was consumed (replay protection): wait for the next one.
        const used = Math.floor(Date.now() / 30000);
        while (Math.floor(Date.now() / 30000) === used)
          await new Promise((r) => setTimeout(r, 500));
        await page.getByLabel("Authentication code").fill(totpNow(secret));
        await page.getByRole("button", { name: "Verify" }).click();
        await page
          .getByLabel("Authentication code")
          .waitFor({ state: "detached", timeout: 15_000 });
        await page.goto(`${BASE}/admin/users`);
        await page.getByText(email).first().waitFor({ timeout: 15_000 });
        const cookies = await page.context().cookies();
        assert.ok(cookies.find((c) => c.name === "amcms_session")?.httpOnly);
        assert.equal(await page.evaluate(() => document.cookie.includes("amcms_session")), false);
      } finally {
        await browser.close();
      }
    });
  }

  await step("deactivated accounts cannot sign in", async () => {
    await db.query("UPDATE auth.users SET banned_until = 'infinity' WHERE lower(email) = $1", [
      email,
    ]);
    const r = await call("/api/auth/sign-in", { body: { email, password } });
    assert.equal(r.status, 401);
  });

  await db.end();
  console.log(`\nALL ${passed} SMOKE CHECKS PASSED`);
}

main().catch(async (err) => {
  console.error(err);
  await db.end().catch(() => {});
  process.exit(1);
});
