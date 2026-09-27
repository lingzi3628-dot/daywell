import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { installedModules, moduleData } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getModuleManifest, type ModulePermission } from "@/lib/modules/catalog";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your installed apps." }, { status: 401 });
  const installed = await db.select().from(installedModules).where(eq(installedModules.userId, user.id));
  return NextResponse.json({ installed });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage apps." }, { status: 401 });
  try {
    const body = await req.json(); const manifest = getModuleManifest(String(body.moduleId || ""));
    if (!manifest) return NextResponse.json({ error: "That app is not in the Daywell catalog." }, { status: 404 });
    const action = String(body.action || "");
    if (action === "install" || action === "update") {
      const requested = Array.isArray(body.permissions) ? body.permissions : [];
      if (requested.some((p: unknown) => typeof p !== "string" || !manifest.permissions.includes(p as ModulePermission))) return NextResponse.json({ error: "This app requested an invalid permission." }, { status: 400 });
      const permissions = [...new Set(requested)] as ModulePermission[];
      const [existing] = await db.select().from(installedModules).where(and(eq(installedModules.userId, user.id), eq(installedModules.moduleId, manifest.id))).limit(1);
      if (action === "update" && !existing) return NextResponse.json({ error: "Install this app before updating it." }, { status: 404 });
      const [item] = await db.insert(installedModules).values({ userId: user.id, moduleId: manifest.id, version: manifest.version, permissions: existing && action === "update" ? existing.permissions as ModulePermission[] : permissions, enabled: true, updatedAt: new Date() }).onConflictDoUpdate({ target: [installedModules.userId, installedModules.moduleId], set: { version: manifest.version, permissions: existing && action === "update" ? existing.permissions as ModulePermission[] : permissions, enabled: true, updatedAt: new Date() } }).returning();
      return NextResponse.json({ item });
    }
    if (action === "permissions") {
      const [existing] = await db.select().from(installedModules).where(and(eq(installedModules.userId, user.id), eq(installedModules.moduleId, manifest.id))).limit(1);
      if (!existing) return NextResponse.json({ error: "Install this app first." }, { status: 404 });
      const requested = Array.isArray(body.permissions) ? body.permissions : [];
      if (requested.some((p: unknown) => typeof p !== "string" || !manifest.permissions.includes(p as ModulePermission))) return NextResponse.json({ error: "This app requested an invalid permission." }, { status: 400 });
      const permissions = [...new Set(requested)] as ModulePermission[];
      const [item] = await db.update(installedModules).set({ permissions, updatedAt: new Date() }).where(and(eq(installedModules.userId, user.id), eq(installedModules.moduleId, manifest.id))).returning();
      return NextResponse.json({ item });
    }
    if (action === "uninstall") {
      await db.delete(installedModules).where(and(eq(installedModules.userId, user.id), eq(installedModules.moduleId, manifest.id)));
      if (body.deleteData === true) await db.delete(moduleData).where(and(eq(moduleData.userId, user.id), eq(moduleData.moduleId, manifest.id)));
      return NextResponse.json({ ok: true, dataDeleted: body.deleteData === true });
    }
    return NextResponse.json({ error: "Unknown app action." }, { status: 400 });
  } catch { return NextResponse.json({ error: "Could not update this app. Try again." }, { status: 500 }); }
}
