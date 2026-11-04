#!/usr/bin/env node
/**
 * Applies the database schema to DATABASE_URL:
 *   1. db/platform/000_platform.sql (idempotent; every run)
 *   2. db/migrations/*.sql in filename order, each in its own transaction, recorded in
 *      public.schema_migrations so it never runs twice.
 * A Postgres advisory lock prevents two app containers from migrating at the same time.
 *
 * Usage: DATABASE_URL=postgres://... node scripts/migrate.mjs [--status]
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const statusOnly = process.argv.includes("--status");
const sslMode = process.env.PGSSLMODE;
const client = new pg.Client({
  connectionString: url,
  ssl:
    sslMode && sslMode !== "disable"
      ? { rejectUnauthorized: sslMode === "verify-full" }
      : undefined,
});

const LOCK_ID = 727274; // arbitrary constant for pg_advisory_lock

async function main() {
  await client.connect();
  await client.query("SET client_min_messages = warning");
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
  try {
    const platform = await readFile(path.join(root, "db/platform/000_platform.sql"), "utf8");
    await client.query(platform);
    const files = (await readdir(path.join(root, "db/migrations")))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const applied = new Set(
      (await client.query("SELECT version FROM public.schema_migrations")).rows.map(
        (r) => r.version,
      ),
    );
    const pending = files.filter((f) => !applied.has(f));
    if (statusOnly) {
      for (const f of files) console.log(`${applied.has(f) ? "applied " : "PENDING "} ${f}`);
      return;
    }
    if (!pending.length) {
      console.log(`Database is up to date (${files.length} migrations).`);
      return;
    }
    for (const f of pending) {
      const sql = await readFile(path.join(root, "db/migrations", f), "utf8");
      process.stdout.write(`Applying ${f} ... `);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO public.schema_migrations (version) VALUES ($1)", [f]);
        await client.query("COMMIT");
        console.log("ok");
      } catch (err) {
        await client.query("ROLLBACK");
        console.log("FAILED");
        throw err;
      }
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
