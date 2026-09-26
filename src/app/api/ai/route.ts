import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goals, tasks, messages, checkins } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { askWithAccess, getAIStatus, streamWithAccess } from "@/lib/ai-access";

export const maxDuration = 60;
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view AI status." }, { status: 401 });
  return NextResponse.json(await getAIStatus(user.id, user.email));
}
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function fallbackPlan(idea: string) {
  const clean = idea.trim().replace(/[.!?]+$/, ""); const lower = clean.toLowerCase();
  const action = clean.replace(/^(i want to|i'd like to|i would like to|help me|i need to)\s+/i, "");
  const category = /write|book|novel|story|script|draw|art|create/.test(lower) ? "Creative" : /business|launch|client|brand|startup|sell/.test(lower) ? "Business" : /study|learn|exam|research|read|course/.test(lower) ? "Learning" : /fitness|health|run|sleep|mindful|exercise/.test(lower) ? "Wellness" : "Personal";
  const subject = action.length > 65 ? action.slice(0, 62) + "…" : action;
  return { title: titleCase(subject), description: `A realistic, step-by-step plan to ${action.charAt(0).toLowerCase() + action.slice(1)}. Focus on progress, not perfection.`, category, tasks: [`Define what success looks like for ${subject.toLowerCase()}`, `Set aside 20 focused minutes to get started`, `Complete one small, concrete first step`, `Reflect on what worked and plan tomorrow’s next step`] };
}
function fallbackChat(prompt: string, goalTitles: string[]) {
  const p = prompt.toLowerCase(); const context = goalTitles.length ? ` I can see you’re working on ${goalTitles.slice(0, 2).join(" and ")}.` : "";
  if (/overwhelm|stress|anxious|stuck|hard/.test(p)) return `That sounds like a lot to carry. Take a breath — you don’t have to solve everything right now.${context}\n\nTry choosing just one tiny action you could finish in the next 10 minutes. What would make today feel a little lighter?`;
  if (/plan|schedule|today|priorit/.test(p)) return `Let’s make this manageable.${context}\n\n1. Pick the one thing that would make today a win.\n2. Break it into a 20-minute first step.\n3. Put a short break after it, then check in with yourself.\n\nWhat’s the most important thing on your mind?`;
  if (/write|story|novel|script/.test(p)) return `I love that creative spark.${context}\n\nTry writing a single scene where your character wants something, but something small gets in the way. Don’t worry about making it perfect — just get it on the page. Want to brainstorm an opening together?`;
  return `That’s worth exploring.${context}\n\nA good place to start is to ask: what would the smallest useful next step look like? Tell me a bit more about what you’re aiming for, and I’ll help you turn it into something doable.`;
}
function fallbackWriting(type: string, title: string, genre: string, premise: string, mode: string) {
  const idea = premise || `a surprising discovery that changes everything`;
  if (mode === "outline") return `# ${title}\n${type} outline · ${genre}\n\n## The spark\n${idea}\n\n## Act I — An ordinary world, interrupted\nIntroduce a protagonist with a private longing. An unexpected event connected to ${idea.toLowerCase()} upends their routine. End with a choice they can’t take back.\n\n## Act II — The beautiful complication\nEvery attempt to solve the problem reveals a deeper truth. Introduce an ally with an opposing point of view. At the midpoint, give the protagonist what they wanted — at a cost.\n\n## Act III — A different kind of courage\nA setback forces them to confront the belief holding them back. In the climax, they choose who they want to become. Close with an image that echoes the opening, transformed.\n\n## Next writing step\nWrite the opening scene in 20 minutes. Let it be messy.`;
  if (type === "Script") return `# ${title}\n${genre.toUpperCase()} · OPENING SCENE\n\nFADE IN:\n\nINT. QUIET ROOM — EARLY MORNING\n\nA thin line of light crosses a cluttered desk. Somewhere, a clock ticks too loudly.\n\nOur PROTAGONIST stares at something that shouldn’t be there. The discovery makes the ordinary room feel suddenly unfamiliar.\n\nPROTAGONIST\n(quietly)\nThis changes everything.\n\nOutside, the world carries on as if nothing has happened. But here, the first thread of ${idea.toLowerCase()} has begun to unravel.\n\nCUT TO BLACK.\n\n[Continue by introducing the first obstacle and a character who sees things differently.]`;
  return `# ${title}\n\nThe morning had begun like any other, which was why the change felt so impossible to name. The light came through the window at its usual angle. The street below was full of its usual sounds. And yet, something about ${idea.toLowerCase()} had made the familiar world feel like a place they were seeing for the very first time.\n\nThey reached for the nearest object, not because it would help, but because doing something with their hands felt easier than standing still.\n\n“Are you coming?” a voice called from the other room.\n\n“In a minute,” they said. But they already knew that a minute would not be enough.\n\nOutside, a door closed. Somewhere beyond it, a decision waited.\n\n---\n\nWriting note: Continue with a concrete choice your protagonist must make. What do they stand to lose?`;
}
export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json(); const input = String(body.input || "").trim().slice(0, 5000);
    if (!input) return NextResponse.json({ error: "Please enter something first." }, { status: 400 });
    if (body.action === "plan") {
      const system = "You are Daywell, an encouraging life planning assistant. Turn the user's idea into an achievable daily-life goal. Return ONLY valid JSON with keys title (short), description (one sentence), category (one of Personal, Wellness, Business, Creative, Learning), tasks (array of 4 specific achievable first steps). No markdown.";
      let plan = fallbackPlan(input); let powered = false;
      const response = await askWithAccess(user.id, user.email, "plan", system, input); if (response) { try { const parsed = JSON.parse(response.replace(/^```(?:json)?\s*|\s*```$/g, "")); if (parsed.title && Array.isArray(parsed.tasks)) { plan = { title: String(parsed.title).slice(0, 200), description: String(parsed.description || ""), category: String(parsed.category || "Personal"), tasks: parsed.tasks.slice(0, 6).map(String) }; powered = true; } } catch { /* safe local plan */ } }
      const [goal] = await db.insert(goals).values({ userId: user.id, title: plan.title, description: plan.description, category: plan.category, color: plan.category === "Creative" ? "mint" : plan.category === "Wellness" ? "peach" : "purple" }).returning();
      const created = await db.insert(tasks).values(plan.tasks.map(title => ({ userId: user.id, goalId: goal.id, title, dueDate: new Date().toISOString().slice(0, 10) }))).returning();
      return NextResponse.json({ goal, tasks: created, powered });
    }
    if (body.action === "chat-stream") {
      const history = await db.select().from(messages).where(eq(messages.userId, user.id)).orderBy(messages.createdAt);
      const ownGoals = await db.select().from(goals).where(eq(goals.userId, user.id));
      const [latestCheckin] = await db.select().from(checkins).where(eq(checkins.userId, user.id)).orderBy(desc(checkins.day)).limit(1);
      const checkinContext = latestCheckin ? ` Last check-in: feeling ${latestCheckin.mood.toLowerCase()} on ${latestCheckin.day}. Note: ${latestCheckin.note.slice(0, 500) || "none"}.` : "";
      const system = `You are Daywell, a warm and capable AI companion for students, founders, researchers and creators. Answer the user's actual question first. Be accurate, thoughtful and specific; use relevant details from this conversation and goals. Keep routine replies concise, but give depth when asked. Avoid filler, repeated summaries and generic motivational language. Offer practical next steps when useful, and ask at most one focused follow-up question. Never claim to have changed data or set reminders unless the app confirms it. You are not a therapist, doctor, lawyer or financial adviser; respond with care and encourage qualified support for high-stakes decisions. Active goals: ${ownGoals.filter(g => g.status === "active").map(g => g.title).join(", ") || "none yet"}.${checkinContext}`;
      const encoder = new TextEncoder();
      const emit = (controller: ReadableStreamDefaultController<Uint8Array>, value: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            let reply = await streamWithAccess(user.id, user.email, "chat", system, input, history, token => emit(controller, { type: "token", token }));
            if (!reply) {
              reply = fallbackChat(input, ownGoals.map(g => g.title));
              for (const part of reply.match(/\S+\s*/g) || [reply]) {
                emit(controller, { type: "token", token: part });
                await new Promise(resolve => setTimeout(resolve, 18));
              }
            }
            const [sent] = await db.insert(messages).values({ userId: user.id, role: "user", content: input }).returning();
            const [received] = await db.insert(messages).values({ userId: user.id, role: "assistant", content: reply }).returning();
            emit(controller, { type: "done", sent, received });
          } catch (error) {
            emit(controller, { type: "error", error: error instanceof Error ? error.message : "AI request failed. Try again." });
          } finally { controller.close(); }
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" } });
    }
    if (body.action === "chat") {
      const history = await db.select().from(messages).where(eq(messages.userId, user.id)).orderBy(messages.createdAt);
      const ownGoals = await db.select().from(goals).where(eq(goals.userId, user.id));
      const [latestCheckin] = await db.select().from(checkins).where(eq(checkins.userId, user.id)).orderBy(desc(checkins.day)).limit(1);
      const checkinContext = latestCheckin ? ` Last check-in: feeling ${latestCheckin.mood.toLowerCase()} on ${latestCheckin.day}. Note: ${latestCheckin.note.slice(0,500) || "none"}.` : "";
      const system = `You are Daywell, a warm and capable AI companion for students, founders, researchers and creators. Answer the user's actual question first. Be accurate, thoughtful and specific; use relevant details from this conversation and goals. Keep routine replies concise, but give depth when asked. Avoid filler, repeated summaries and generic motivational language. Offer practical next steps when useful, and ask at most one focused follow-up question. Never claim to have changed data or set reminders unless the app confirms it. You are not a therapist, doctor, lawyer or financial adviser; respond with care and encourage qualified support for high-stakes decisions. Active goals: ${ownGoals.filter(g => g.status === "active").map(g => g.title).join(", ") || "none yet"}.${checkinContext}`;
      const reply = await askWithAccess(user.id, user.email, "chat", system, input, history) || fallbackChat(input, ownGoals.map(g => g.title));
      const [sent] = await db.insert(messages).values({ userId: user.id, role: "user", content: input }).returning();
      const [received] = await db.insert(messages).values({ userId: user.id, role: "assistant", content: reply }).returning();
      return NextResponse.json({ sent, received });
    }
    if (body.action === "write") {
      const type = ["Novel", "Story", "Script"].includes(body.type) ? body.type : "Story"; const mode = body.mode === "outline" ? "outline" : "draft";
      const title = String(body.title || "Untitled").slice(0, 150); const genre = String(body.genre || "Contemporary").slice(0, 100);
      const system = `You are an imaginative professional ${type.toLowerCase()} writing partner. Write an original, compelling ${mode === "outline" ? "three-act detailed outline with vivid character and plot beats" : type === "Script" ? "screenplay opening scene in proper script format" : "opening prose scene of 400-600 words"}. Use Markdown headings. Honor the user's premise and genre, avoid clichés, and make it genuinely useful to continue writing.`;
      const content = await askWithAccess(user.id, user.email, "write", system, `Title: ${title}\nGenre: ${genre}\nPremise: ${input}\nMode: ${mode}`) || fallbackWriting(type, title, genre, input, mode);
      return NextResponse.json({ content });
    }
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed. Try again." }, { status: 500 }); }
}
