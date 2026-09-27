import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goals, tasks, reminders, projects, messages, connections } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { decrypt, encrypt, getUser } from "@/lib/auth";
import { callProvider, supportedProviders, validateEndpoint } from "@/lib/providers";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
export async function GET() {
  const user = await getUser(); if (!user) return bad("Unauthorized", 401);
  const uid = user.id;
  const [g, t, r, p, m, c] = await Promise.all([
    db.select().from(goals).where(eq(goals.userId, uid)).orderBy(desc(goals.createdAt)),
    db.select().from(tasks).where(eq(tasks.userId, uid)).orderBy(desc(tasks.createdAt)),
    db.select().from(reminders).where(eq(reminders.userId, uid)).orderBy(reminders.remindAt),
    db.select().from(projects).where(eq(projects.userId, uid)).orderBy(desc(projects.updatedAt)),
    db.select().from(messages).where(eq(messages.userId, uid)).orderBy(messages.createdAt),
    db.select({ id: connections.id, provider: connections.provider, model: connections.model, endpoint: connections.endpoint, isActive: connections.isActive, createdAt: connections.createdAt }).from(connections).where(eq(connections.userId, uid)).orderBy(desc(connections.createdAt)),
  ]);
  return NextResponse.json({ goals: g, tasks: t, reminders: r, projects: p, messages: m, connections: c });
}
export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return bad("Unauthorized", 401);
  try {
    const { resource, data = {} } = await req.json(); const uid = user.id;
    if (resource === "goals") { if (!data.title?.trim()) return bad("A title is required."); const [item] = await db.insert(goals).values({ userId: uid, title: data.title.trim().slice(0, 200), description: String(data.description || ""), category: String(data.category || "Personal"), color: String(data.color || "blue"), targetDate: data.targetDate || null }).returning(); return NextResponse.json({ item }); }
    if (resource === "tasks") { if (!data.title?.trim()) return bad("A title is required."); if (data.goalId) { const [goal] = await db.select().from(goals).where(and(eq(goals.id, data.goalId), eq(goals.userId, uid))); if (!goal) return bad("Goal not found."); } const [item] = await db.insert(tasks).values({ userId: uid, title: data.title.trim().slice(0, 200), goalId: data.goalId || null, dueDate: data.dueDate || null, priority: data.priority || "medium" }).returning(); return NextResponse.json({ item }); }
    if (resource === "reminders") { if (!data.title?.trim() || !data.remindAt || isNaN(new Date(data.remindAt).getTime())) return bad("Title and valid date are required."); const [item] = await db.insert(reminders).values({ userId: uid, title: data.title.trim().slice(0, 200), note: String(data.note || ""), remindAt: new Date(data.remindAt) }).returning(); return NextResponse.json({ item }); }
    if (resource === "projects") { if (!data.title?.trim()) return bad("A title is required."); const [item] = await db.insert(projects).values({ userId: uid, title: data.title.trim().slice(0, 200), type: data.type || "Story", genre: data.genre || "Contemporary", premise: data.premise || "", content: data.content || "" }).returning(); return NextResponse.json({ item }); }
    if (resource === "connections") { if (!data.provider || !data.model?.trim() || !data.apiKey?.trim()) return bad("Provider, model, and API key are required."); if (!supportedProviders.includes(data.provider)) return bad("Unsupported provider."); const endpoint = data.provider === "Custom" ? await validateEndpoint(String(data.endpoint || "")) : null; await callProvider({ provider: data.provider, model: data.model.trim(), apiKey: data.apiKey.trim(), endpoint }, "Reply with a short greeting to verify this API connection.", "Say hello in one short sentence.", [], 25000); await db.update(connections).set({ isActive: false }).where(eq(connections.userId, uid)); const [row] = await db.insert(connections).values({ userId: uid, provider: data.provider, model: data.model.trim().slice(0,200), endpoint, encryptedKey: encrypt(data.apiKey.trim()) }).returning(); return NextResponse.json({ item: { id: row.id, provider: row.provider, model: row.model, endpoint: row.endpoint, isActive: row.isActive, createdAt: row.createdAt } }); }
    return bad("Unknown resource.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save. Check your input and try again.";
    if (msg.includes("ENCRYPTION_KEY")) {
      // Server is missing its ENCRYPTION_KEY — encrypt() refused to run. The
      // user can't fix this from the UI; an admin must set it in Vercel.
      return bad("The server is missing its ENCRYPTION_KEY, so it can't safely store your API key. An admin needs to set ENCRYPTION_KEY (>=32 chars) in Vercel → Settings → Environment Variables, then redeploy.", 500);
    }
    return bad(msg);
  }
}
export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user) return bad("Unauthorized", 401);
  try {
    const { resource, id, data = {} } = await req.json(); if (!id) return bad("ID required."); const uid = user.id;
    if (resource === "goals") { const [item] = await db.update(goals).set({ ...(data.title !== undefined ? { title: String(data.title).slice(0, 200) } : {}), ...(data.description !== undefined ? { description: String(data.description) } : {}), ...(data.category !== undefined ? { category: String(data.category) } : {}), ...(data.color !== undefined ? { color: String(data.color) } : {}), ...(data.targetDate !== undefined ? { targetDate: data.targetDate || null } : {}), ...(data.status !== undefined ? { status: data.status } : {}) }).where(and(eq(goals.id, id), eq(goals.userId, uid))).returning(); return item ? NextResponse.json({ item }) : bad("Not found.", 404); }
    if (resource === "tasks") { const [item] = await db.update(tasks).set({ ...(data.title !== undefined ? { title: String(data.title).slice(0, 200) } : {}), ...(data.completed !== undefined ? { completed: !!data.completed } : {}), ...(data.priority !== undefined ? { priority: data.priority } : {}), ...(data.dueDate !== undefined ? { dueDate: data.dueDate || null } : {}) }).where(and(eq(tasks.id, id), eq(tasks.userId, uid))).returning(); return item ? NextResponse.json({ item }) : bad("Not found.", 404); }
    if (resource === "reminders") { const [item] = await db.update(reminders).set({ ...(data.title !== undefined ? { title: String(data.title).slice(0, 200) } : {}), ...(data.note !== undefined ? { note: String(data.note) } : {}), ...(data.remindAt !== undefined && !isNaN(new Date(data.remindAt).getTime()) ? { remindAt: new Date(data.remindAt) } : {}), ...(data.done !== undefined ? { done: !!data.done } : {}) }).where(and(eq(reminders.id, id), eq(reminders.userId, uid))).returning(); return item ? NextResponse.json({ item }) : bad("Not found.", 404); }
    if (resource === "projects") { const [item] = await db.update(projects).set({ ...(data.title !== undefined ? { title: String(data.title).slice(0, 200) } : {}), ...(data.type !== undefined ? { type: data.type } : {}), ...(data.genre !== undefined ? { genre: data.genre } : {}), ...(data.premise !== undefined ? { premise: data.premise } : {}), ...(data.content !== undefined ? { content: data.content } : {}), updatedAt: new Date() }).where(and(eq(projects.id, id), eq(projects.userId, uid))).returning(); return item ? NextResponse.json({ item }) : bad("Not found.", 404); }
    if (resource === "connections") { const [existing] = await db.select().from(connections).where(and(eq(connections.id, id), eq(connections.userId, uid))).limit(1); if (!existing) return bad("Not found.", 404); const endpoint = data.endpoint !== undefined && existing.provider === "Custom" ? await validateEndpoint(String(data.endpoint)) : existing.endpoint; if (data.isActive || data.model !== undefined || data.apiKey?.trim() || data.endpoint !== undefined) await callProvider({ provider: existing.provider, model: data.model !== undefined ? String(data.model).trim() : existing.model, apiKey: data.apiKey?.trim() || decrypt(existing.encryptedKey), endpoint }, "Reply with a short greeting to verify this API connection.", "Say hello in one short sentence.", [], 25000); if (data.isActive) await db.update(connections).set({ isActive: false }).where(eq(connections.userId, uid)); const [item] = await db.update(connections).set({ ...(data.isActive !== undefined ? { isActive: !!data.isActive } : {}), ...(data.model !== undefined ? { model: String(data.model).trim().slice(0,200) } : {}), ...(data.apiKey?.trim() ? { encryptedKey: encrypt(data.apiKey.trim()) } : {}), endpoint }).where(and(eq(connections.id, id), eq(connections.userId, uid))).returning(); return NextResponse.json({ item: { id: item.id, provider: item.provider, model: item.model, endpoint: item.endpoint, isActive: item.isActive, createdAt: item.createdAt } }); }
    return bad("Unknown resource.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update item.";
    if (msg.includes("ENCRYPTION_KEY")) {
      return bad("The server is missing its ENCRYPTION_KEY, so it can't safely store your API key. An admin needs to set ENCRYPTION_KEY (>=32 chars) in Vercel → Settings → Environment Variables, then redeploy.", 500);
    }
    return bad(msg);
  }
}
export async function DELETE(req: NextRequest) {
  const user = await getUser(); if (!user) return bad("Unauthorized", 401);
  try { const { resource, id } = await req.json(); if (!id) return bad("ID required."); const uid = user.id;
    if (resource === "goals") await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, uid)));
    else if (resource === "tasks") await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, uid)));
    else if (resource === "reminders") await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, uid)));
    else if (resource === "projects") await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, uid)));
    else if (resource === "connections") await db.delete(connections).where(and(eq(connections.id, id), eq(connections.userId, uid)));
    else return bad("Unknown resource."); return NextResponse.json({ ok: true });
  } catch { return bad("Could not delete item."); }
}
