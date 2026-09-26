import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// Neon's HTTP driver is the correct client for serverless runtimes (Vercel,
// Cloudflare Workers, Deno Deploy, etc.). Each query is a single HTTPS request
// to Neon — no TCP pool to manage, no idle connections to leak, no cold-start
// TLS handshake penalty. The `pg.Pool` based driver does not work reliably
// inside Vercel serverless functions and causes intermittent 500s on /api/auth.
//
// `DATABASE_URL_POOLED` is the recommended Neon pooled URL (pooler mode).
// `DATABASE_URL` (direct) is used for migration tooling but also works here
// as a fallback for local development.
const databaseUrl = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL_POOLED (or DATABASE_URL) is not set. Add it in your Vercel project → Settings → Environment Variables, then redeploy. See .env.example for the expected format."
  );
}

// `neon()` returns a tagged-template query function that talks to Neon over
// HTTPS. Drizzle wraps it into the same query-builder API the rest of the
// codebase already uses (`db.select().from(...).where(...)`, `db.insert(...)`,
// `db.update(...)`, `db.delete(...)`, `db.execute(sql\`...\`)`).
const sql = neon(databaseUrl);

export const db = drizzle({ client: sql });
