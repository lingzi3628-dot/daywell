import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Returns the live runtime configuration status so you can verify a deployment
// with a single GET /api/health. Used to catch missing env vars before users
// hit them — DATABASE_URL_POOLED and ENCRYPTION_KEY are the two that break
// auth/data routes silently when absent.
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // 1) Database URL presence
  const dbUrl = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
  checks.databaseUrl = {
    ok: !!dbUrl,
    detail: dbUrl ? undefined : "DATABASE_URL_POOLED (or DATABASE_URL) is not set. Add the Neon pooled connection string in Vercel → Settings → Environment Variables.",
  };

  // 2) Database connectivity (only if URL is present)
  if (dbUrl) {
    try {
      await db.execute(sql`select 1`);
      checks.database = { ok: true };
    } catch (e) {
      checks.database = {
        ok: false,
        detail: e instanceof Error ? `DB query failed: ${e.message}` : "DB query failed.",
      };
    }
  }

  // 3) ENCRYPTION_KEY — required in production, must be >=32 chars.
  //    encrypt()/decrypt() throw on this, so any route that saves or reads an
  //    encrypted AI provider key will 500 without it.
  const encryptionKey = process.env.ENCRYPTION_KEY;
  const encryptionOk = process.env.NODE_ENV !== "production" || (!!encryptionKey && encryptionKey.length >= 32);
  checks.encryptionKey = {
    ok: encryptionOk,
    detail: encryptionOk
      ? undefined
      : "ENCRYPTION_KEY is missing or too short. Generate one with `openssl rand -hex 32` and add it in Vercel → Settings → Environment Variables (all environments), then redeploy.",
  };

  // 4) OPENROUTER_API_KEY (optional) — enables the shared staff AI service.
  checks.openRouterApiKey = {
    ok: !!process.env.OPENROUTER_API_KEY,
    detail: process.env.OPENROUTER_API_KEY
      ? undefined
      : "OPENROUTER_API_KEY is not set. Optional — only needed if you want the shared staff AI service to work without users bringing their own key.",
  };

  const allOk = Object.values(checks).every(c => c.ok);
  return Response.json({ ok: allOk, checks }, { status: allOk ? 200 : 503 });
}
