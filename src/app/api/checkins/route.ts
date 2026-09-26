import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { checkins, goals } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { askWithAccess } from "@/lib/ai-access";

export const maxDuration = 60;
const today = () => new Date().toISOString().slice(0,10);
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view check-ins." }, { status: 401 });
  const items = await db.select().from(checkins).where(eq(checkins.userId, user.id)).orderBy(desc(checkins.day)).limit(14);
  return NextResponse.json({ items });
}
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to save a check-in." }, { status: 401 });
  try {
    const body = await req.json();
    const mood = String(body.mood || "");
    const note = String(body.note || "").trim().slice(0,1000);
    if (!["Great", "Good", "Okay", "Low", "Stressed"].includes(mood)) return NextResponse.json({ error: "Choose how you're feeling first." }, { status: 400 });
    const currentDay = today();
    let reflection = `Thanks for checking in. ${mood === "Great" || mood === "Good" ? "Hold on to what’s working today and take one small step forward." : "Go gently with yourself today. One small step is enough."}`;
    let warning: string | undefined;
    try {
      const activeGoals = await db.select({ title: goals.title }).from(goals).where(and(eq(goals.userId, user.id), eq(goals.status, "active"))).limit(3);
      reflection = await askWithAccess(user.id, user.email, "check-in", "You are a warm, practical daily check-in companion. Reply in 2-3 short sentences with empathy, one grounded observation and ONE manageable next step. Do not diagnose or make promises. Avoid empty platitudes.", `Today I feel ${mood.toLowerCase()}. My note: ${note || "No note yet."}. My goals: ${activeGoals.map(g=>g.title).join(", ") || "none yet"}.`) || reflection;
    } catch (e) { warning = e instanceof Error ? e.message : "Live reflection unavailable right now."; }
    const [item] = await db.insert(checkins).values({ userId: user.id, day: currentDay, mood, note, reflection }).onConflictDoUpdate({ target: [checkins.userId, checkins.day], set: { mood, note, reflection } }).returning();
    return NextResponse.json({ item, warning });
  } catch { return NextResponse.json({ error: "Could not save your check-in." }, { status: 400 }); }
}
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { id } = await req.json();
    await db.delete(checkins).where(and(eq(checkins.id, id), eq(checkins.userId, user.id)));
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not remove check-in." }, { status: 400 }); }
}
