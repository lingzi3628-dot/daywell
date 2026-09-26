import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt, getUser } from "@/lib/auth";
import { callProvider, supportedProviders, validateEndpoint } from "@/lib/providers";

export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to test a connection." }, { status: 401 });
  try {
    const body = await req.json();
    let config: { provider: string; model: string; apiKey: string; endpoint?: string | null };
    if (body.id) {
      const [saved] = await db.select().from(connections).where(and(eq(connections.id, String(body.id)), eq(connections.userId, user.id))).limit(1);
      if (!saved) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
      config = { provider: saved.provider, model: saved.model, apiKey: decrypt(saved.encryptedKey), endpoint: saved.endpoint };
      if (body.model) config.model = String(body.model).trim().slice(0, 200);
      if (body.apiKey) config.apiKey = String(body.apiKey).trim();
      if (body.endpoint) config.endpoint = String(body.endpoint).trim();
    } else {
      config = { provider: String(body.provider || ""), model: String(body.model || "").trim().slice(0, 200), apiKey: String(body.apiKey || "").trim(), endpoint: String(body.endpoint || "").trim() };
    }
    if (!supportedProviders.includes(config.provider) || !config.model || !config.apiKey) return NextResponse.json({ error: "Enter a provider, model, and API key first." }, { status: 400 });
    if (config.provider === "Custom") await validateEndpoint(config.endpoint || "");
    const start = Date.now();
    const reply = await callProvider(config, "Reply with a short friendly greeting to confirm this connection works.", "Say hello in one short sentence.", [], 25000);
    return NextResponse.json({ ok: true, provider: config.provider, model: config.model, latencyMs: Date.now() - start, reply: reply.slice(0, 350) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Connection test failed." }, { status: 400 }); }
}
