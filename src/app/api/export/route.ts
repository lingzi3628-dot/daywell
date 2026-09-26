import { NextResponse } from "next/server";
import { db } from "@/db";
import { checkins, connections, focusSessions, goals, messages, projects, reminders, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to download your workspace." }, { status: 401 });
  const [userGoals, userTasks, userReminders, userProjects, userMessages, userCheckins, userFocus, userConnections] = await Promise.all([
    db.select().from(goals).where(eq(goals.userId, user.id)),
    db.select().from(tasks).where(eq(tasks.userId, user.id)),
    db.select().from(reminders).where(eq(reminders.userId, user.id)),
    db.select().from(projects).where(eq(projects.userId, user.id)),
    db.select().from(messages).where(eq(messages.userId, user.id)),
    db.select().from(checkins).where(eq(checkins.userId, user.id)),
    db.select().from(focusSessions).where(eq(focusSessions.userId, user.id)),
    db.select({ id: connections.id, provider: connections.provider, model: connections.model, endpoint: connections.endpoint, isActive: connections.isActive, createdAt: connections.createdAt }).from(connections).where(eq(connections.userId, user.id)),
  ]);
  const payload = {
    app: "Daywell", formatVersion: 1, exportedAt: new Date().toISOString(),
    account: { name: user.name, email: user.email, role: user.role },
    goals: userGoals, tasks: userTasks, reminders: userReminders, projects: userProjects,
    messages: userMessages, checkins: userCheckins, focusSessions: userFocus, connections: userConnections,
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="daywell-workspace-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
