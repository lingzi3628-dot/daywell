import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED;
if (!url) throw new Error("Set DATABASE_URL (preferred) or DATABASE_URL_POOLED before running Drizzle Kit.");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
