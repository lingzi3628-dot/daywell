import { db } from "@/db";
import { aiUsage, connections } from "@/db/schema";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { decrypt } from "@/lib/auth";
import { callProvider, streamProvider } from "@/lib/providers";

type Msg = { role: string; content: string };
export const DAILY_SHARED_LIMIT = 25;
const dayStart = () => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); };
export async function getAIStatus(userId: string, email: string) {
  const [own] = await db.select({ provider: connections.provider, model: connections.model }).from(connections).where(and(eq(connections.userId, userId), eq(connections.isActive, true))).orderBy(desc(connections.createdAt)).limit(1);
  if (own) return { mode: "own" as const, provider: own.provider, model: own.model, remaining: null };
  if (!process.env.OPENROUTER_API_KEY || email.endsWith("@daywell.demo")) return { mode: "guided" as const, provider: null, model: null, remaining: null };
  const [result] = await db.select({ total: count() }).from(aiUsage).where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, dayStart())));
  return { mode: "included" as const, provider: "OpenRouter", model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini", remaining: Math.max(0, DAILY_SHARED_LIMIT - result.total) };
}
export async function askWithAccess(userId: string, email: string, action: string, system: string, prompt: string, history: Msg[] = []): Promise<string | null> {
  const [own] = await db.select().from(connections).where(and(eq(connections.userId, userId), eq(connections.isActive, true))).orderBy(desc(connections.createdAt)).limit(1);
  if (own) return callProvider({ provider: own.provider, model: own.model, endpoint: own.endpoint, apiKey: decrypt(own.encryptedKey) }, system, prompt, history);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || email.endsWith("@daywell.demo")) return null;
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [result] = await tx.select({ total: count() }).from(aiUsage).where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, dayStart())));
    if (result.total >= DAILY_SHARED_LIMIT) throw new Error("You’ve used today’s included AI requests. Add your own API connection in Settings for more, or come back tomorrow.");
    await tx.insert(aiUsage).values({ userId, action });
  });
  return callProvider({ provider: "OpenRouter", model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini", apiKey: key }, system, prompt, history);
}

export async function streamWithAccess(userId: string, email: string, action: string, system: string, prompt: string, history: Msg[], onToken: (token: string) => void): Promise<string | null> {
  const [own] = await db.select().from(connections).where(and(eq(connections.userId, userId), eq(connections.isActive, true))).orderBy(desc(connections.createdAt)).limit(1);
  if (own) return streamProvider({ provider: own.provider, model: own.model, endpoint: own.endpoint, apiKey: decrypt(own.encryptedKey) }, system, prompt, history, onToken);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || email.endsWith("@daywell.demo")) return null;
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [result] = await tx.select({ total: count() }).from(aiUsage).where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, dayStart())));
    if (result.total >= DAILY_SHARED_LIMIT) throw new Error("You’ve used today’s included AI requests. Add your own API connection in Settings for more, or come back tomorrow.");
    await tx.insert(aiUsage).values({ userId, action });
  });
  return streamProvider({ provider: "OpenRouter", model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini", apiKey: key }, system, prompt, history, onToken);
}
