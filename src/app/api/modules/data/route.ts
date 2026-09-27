import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { installedModules, moduleData } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getModuleManifest, type ModulePermission } from "@/lib/modules/catalog";

async function context(req: NextRequest) {
  const user = await getUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in to use installed apps." }, { status: 401 }) };
  const moduleId = req.nextUrl.searchParams.get("module") || "";
  const key = req.nextUrl.searchParams.get("key") || "";
  const manifest = getModuleManifest(moduleId);
  if (!manifest || !key || key.length > 80) return { response: NextResponse.json({ error: "Unknown app or invalid storage key." }, { status: 400 }) };
  const [installation] = await db.select().from(installedModules).where(and(eq(installedModules.userId, user.id), eq(installedModules.moduleId, moduleId))).limit(1);
  if (!installation?.enabled) return { response: NextResponse.json({ error: "Install and enable this app first." }, { status: 403 }) };
  if (!(installation.permissions as ModulePermission[]).includes("storage")) return { response: NextResponse.json({ error: "This app has not been granted storage permission." }, { status: 403 }) };
  return { user, moduleId, key };
}

export async function GET(req: NextRequest) {
  try {
    const c = await context(req); if ("response" in c) return c.response;
    const [row] = await db.select({ value: moduleData.value }).from(moduleData).where(and(eq(moduleData.userId, c.user.id), eq(moduleData.moduleId, c.moduleId), eq(moduleData.key, c.key))).limit(1);
    return NextResponse.json({ value: row?.value ?? null });
  } catch { return NextResponse.json({ error: "Could not read this app’s saved data." }, { status: 500 }); }
}

export async function PUT(req: NextRequest) {
  try {
    const c = await context(req); if ("response" in c) return c.response;
    const body = await req.json();
    if (!Object.hasOwn(body, "value")) return NextResponse.json({ error: "Provide a value to save." }, { status: 400 });
    const serialized = JSON.stringify(body.value);
    if (serialized.length > 100_000) return NextResponse.json({ error: "App data is too large to save (100 KB limit)." }, { status: 413 });
    await db.insert(moduleData).values({ userId: c.user.id, moduleId: c.moduleId, key: c.key, value: body.value, updatedAt: new Date() }).onConflictDoUpdate({ target: [moduleData.userId, moduleData.moduleId, moduleData.key], set: { value: body.value, updatedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not save this app’s data." }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  try {
    const c = await context(req); if ("response" in c) return c.response;
    await db.delete(moduleData).where(and(eq(moduleData.userId, c.user.id), eq(moduleData.moduleId, c.moduleId), eq(moduleData.key, c.key)));
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not remove this app’s saved data." }, { status: 500 }); }
}
