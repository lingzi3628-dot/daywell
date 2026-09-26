import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, ensureDemo, getUser, hashPassword, signOut, verifyPassword } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("checkEmail")?.trim().toLowerCase();
  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ available: false, message: "Enter a valid email address." });
    const found = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    return NextResponse.json({ available: !found.length, message: found.length ? "Email already registered." : "Email is available." });
  }
  const user = await getUser(); return NextResponse.json({ user: user ? { id: user.id, name: user.name, email: user.email, role: user.role, isDemo: user.email.endsWith("@daywell.demo") } : null });
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!process.env.DATABASE_URL_POOLED && !process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.POSTGRES_PRISMA_URL) {
      return NextResponse.json({ error: "Daywell account storage is still being connected. Please try again shortly." }, { status: 503 });
    }
    if (body.action === "logout") { await signOut(); return NextResponse.json({ ok: true }); }
    if (body.action === "demo") { const user = await ensureDemo(); const sessionToken = await createSession(user.id); return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, isDemo: true }, ...(body.client === "native" ? { sessionToken } : {}) }); }
    const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8) return NextResponse.json({ error: "Enter a valid email and password of at least 8 characters." }, { status: 400 });
    if (body.action === "claim") {
      const current = await getUser();
      if (!current || !current.email.endsWith("@daywell.demo")) return NextResponse.json({ error: "Only demo workspaces can be registered here." }, { status: 403 });
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
      const found = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (found.length) return NextResponse.json({ error: "Email already registered." }, { status: 409 });
      const [user] = await db.update(users).set({ name: name.slice(0, 100), email, passwordHash: hashPassword(password), role: String(body.role || "Creator").slice(0,60) }).where(eq(users.id, current.id)).returning();
      return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, isDemo: false } });
    }
    if (body.action === "register") {
      if (!String(body.name || "").trim()) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
      const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (found.length) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      const [user] = await db.insert(users).values({ name: String(body.name).trim().slice(0, 100), email, passwordHash: hashPassword(password), role: String(body.role || "Creator").slice(0, 60) }).returning();
      const sessionToken = await createSession(user.id); return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...(body.client === "native" ? { sessionToken } : {}) });
    }
    if (body.action === "login") {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !verifyPassword(password, user.passwordHash)) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
      const sessionToken = await createSession(user.id); return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...(body.client === "native" ? { sessionToken } : {}) });
    }
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    // The unique index is the authority when two registrations race after the
    // availability check. Return the same useful response as the normal path.
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not complete your request." }, { status: 500 });
  }
}
