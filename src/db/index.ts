import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Neon recommends the pooled URL for serverless application traffic.
const databaseUrl = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    ...(databaseUrl ? { connectionString: databaseUrl } : {}),
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: databaseUrl?.includes(".neon.tech") ? { rejectUnauthorized: true } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
