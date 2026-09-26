import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { focusSessions, tasks } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const seconds = (start: Date | null, now: Date) => start ? Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000)) : 0;

export async function GET() {
  const user = await getUser(); if (!user) return bad("Sign in to use Focus Studio.", 401);
  const items = await db.select().from(focusSessions).where(eq(focusSessions.userId, user.id)).orderBy(desc(focusSessions.startedAt)).limit(60);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return bad("Sign in to start focusing.", 401);
  try {
    const body = await req.json();
    const minutes = Number(body.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) return bad("Choose a duration between 1 and 120 minutes.");
    const label = String(body.label || "").trim().slice(0, 120);
    const taskId = body.taskId ? String(body.taskId) : null;
    let taskTitle = "";
    if (taskId) {
      const [task] = await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id))).limit(1);
      if (!task) return bad("Task not found.", 404);
      taskTitle = task.title;
    }
    const title = label || taskTitle || "Deep work";
    const item = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
      const [active] = await tx.select({ id: focusSessions.id }).from(focusSessions).where(and(eq(focusSessions.userId, user.id), inArray(focusSessions.status, ["running", "paused"]))).limit(1);
      if (active) return null;
      const now = new Date();
      const [created] = await tx.insert(focusSessions).values({ userId: user.id, taskId, label: title, durationSeconds: minutes * 60, status: "running", lastResumedAt: now, startedAt: now }).returning();
      return created;
    });
    if (!item) return bad("You already have a focus session. Finish or discard it first.", 409);
    return NextResponse.json({ item });
  } catch { return bad("Could not start focus session. Check your selection."); }
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user) return bad("Sign in to update your timer.", 401);
  try {
    const { id, action } = await req.json();
    if (!id || !["pause", "resume", "finish", "discard"].includes(action)) return bad("Invalid session action.");
    return await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
      const [existing] = await tx.select().from(focusSessions).where(and(eq(focusSessions.id, id), eq(focusSessions.userId, user.id))).limit(1);
      if (!existing) return bad("Session not found.", 404);
      if (!["running", "paused"].includes(existing.status)) return bad("This session is already finished.", 409);
      const now = new Date();
      if (action === "pause" && existing.status !== "running" || action === "resume" && existing.status !== "paused") return bad("This action is not available right now.", 409);
      const elapsed = Math.min(existing.durationSeconds, existing.elapsedSeconds + (existing.status === "running" ? seconds(existing.lastResumedAt, now) : 0));
      const status = action === "pause" ? "paused" : action === "resume" ? "running" : action === "finish" ? "finished" : "discarded";
      const [item] = await tx.update(focusSessions).set({ status, elapsedSeconds: elapsed, lastResumedAt: status === "running" ? now : null, finishedAt: ["finished", "discarded"].includes(status) ? now : null }).where(eq(focusSessions.id, existing.id)).returning();
      return NextResponse.json({ item });
    });
  } catch { return bad("Could not update the session."); }
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(); if (!user) return bad("Sign in to remove a session.", 401);
  try {
    const { id } = await req.json();
    const [item] = await db.delete(focusSessions).where(and(eq(focusSessions.id, id), eq(focusSessions.userId, user.id), inArray(focusSessions.status, ["finished", "discarded"]))).returning();
    if (!item) return bad("Only completed or discarded sessions can be removed.", 404);
    return NextResponse.json({ ok: true });
  } catch { return bad("Could not remove session."); }
}
