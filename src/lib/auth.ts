import { cookies, headers } from "next/headers";
import { randomBytes, createHash, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";
import { db } from "@/db";
import { users, sessions, goals, tasks, reminders, projects, messages } from "@/db/schema";
import { eq } from "drizzle-orm";

export const hashPassword = (password: string) => { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`; };
export const verifyPassword = (password: string, stored: string) => { try { const [salt, hash] = stored.split(":"); return timingSafeEqual(Buffer.from(hash, "hex"), scryptSync(password, salt, 64)); } catch { return false; } };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function encryptionSecret() {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (process.env.NODE_ENV === "production" && (!encryptionKey || encryptionKey.length < 32)) {
    throw new Error("ENCRYPTION_KEY must be set to a random value of at least 32 characters in production.");
  }
  return createHash("sha256").update(encryptionKey || "daywell-local-development-key").digest();
}
export function encrypt(value: string) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionSecret(), iv); const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`; }
export function decrypt(value: string) { const [iv, tag, data] = value.split(":"); const decipher = createDecipheriv("aes-256-gcm", encryptionSecret(), Buffer.from(iv, "hex")); decipher.setAuthTag(Buffer.from(tag, "hex")); return decipher.update(Buffer.from(data, "hex"), undefined, "utf8") + decipher.final("utf8"); }
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ userId, tokenHash: sha(token), expiresAt: new Date(Date.now() + 30 * 86400000) });
  (await cookies()).set("daywell_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  return token;
}
async function requestTokens() {
  const authorization = (await headers()).get("authorization") || "";
  const bearer = /^Bearer ([a-f0-9]{64})$/i.exec(authorization)?.[1];
  const cookie = (await cookies()).get("daywell_session")?.value;
  return [...new Set([bearer, cookie].filter((token): token is string => !!token && /^[a-f0-9]{64}$/i.test(token)))];
}
export async function getUser() {
  for (const token of await requestTokens()) {
    const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, sha(token))).limit(1);
    if (!session || session.expiresAt < new Date()) continue;
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (user) return user;
  }
  return null;
}
export async function signOut() {
  for (const token of await requestTokens()) await db.delete(sessions).where(eq(sessions.tokenHash, sha(token)));
  (await cookies()).delete("daywell_session");
}
export async function ensureDemo() {
  const email = `demo-${randomBytes(8).toString("hex")}@daywell.demo`;
  const [user] = await db.insert(users).values({ name: "Alex Morgan", email, passwordHash: hashPassword(randomBytes(20).toString("hex")), role: "Student & creator" }).returning();
  const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const [g1, g2, g3] = await db.insert(goals).values([
    { userId: user.id, title: "Build a mindful morning routine", description: "Start each day with intention, movement, and a clear mind.", category: "Wellness", color: "peach", targetDate: future(28) },
    { userId: user.id, title: "Launch my side project", description: "Turn my creative idea into a real product, one step at a time.", category: "Business", color: "purple", targetDate: future(45) },
    { userId: user.id, title: "Write my first short story", description: "Make space to write a little bit every day.", category: "Creative", color: "mint", targetDate: future(21) },
  ]).returning();
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(tasks).values([
    { userId: user.id, goalId: g1.id, title: "Write down 3 things I’m grateful for", completed: true, priority: "medium", dueDate: today },
    { userId: user.id, goalId: g2.id, title: "Sketch the first version of my landing page", priority: "high", dueDate: today },
    { userId: user.id, goalId: g1.id, title: "Take a 20-minute walk outside", priority: "medium", dueDate: today },
    { userId: user.id, goalId: g3.id, title: "Write for 15 minutes without editing", priority: "low", dueDate: today },
  ]);
  await db.insert(reminders).values([
    { userId: user.id, title: "Take a screen break", note: "Step away and recharge for a few minutes", remindAt: new Date(Date.now() + 2 * 3600000) },
    { userId: user.id, title: "Evening journal", note: "Reflect on the wins from today", remindAt: new Date(Date.now() + 8 * 3600000) },
  ]);
  await db.insert(projects).values([{ userId: user.id, title: "The Last Bookshop", type: "Story", genre: "Literary fiction", premise: "A quiet bookshop owner discovers messages hidden in donated books.", content: "The bell above the door rang just as the rain began. Mara looked up from her ledger to find a stranger holding a book she had never seen before.\n\nInside its cover, someone had written: Don't let this story end here." }]);
  await db.insert(messages).values([{ userId: user.id, role: "assistant", content: "Hey Alex! I’m here to help you turn big ideas into small, doable steps. What’s on your mind today?" }]);
  return user;
}
