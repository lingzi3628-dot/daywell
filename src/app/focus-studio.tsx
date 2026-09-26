"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Timer, Play, Pause, Square, RotateCcw, Check, Trash2, Loader2, Target, Clock3, TrendingUp, Sparkles } from "lucide-react";
import { authFetch } from "@/lib/client-auth";

type Task = { id: string; title: string; completed: boolean };
type Session = { id: string; taskId: string | null; label: string; durationSeconds: number; elapsedSeconds: number; status: "running" | "paused" | "finished" | "discarded"; startedAt: string; lastResumedAt: string | null; finishedAt: string | null };
const elapsed = (s: Session, now: number) => Math.min(s.durationSeconds, s.elapsedSeconds + (s.status === "running" && s.lastResumedAt ? Math.max(0, Math.floor((now - new Date(s.lastResumedAt).getTime()) / 1000)) : 0));
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export default function FocusStudio({ tasks, onTaskComplete, onUnauthorized }: { tasks: Task[]; onTaskComplete: (id: string) => Promise<void>; onUnauthorized: () => void }) {
  const [items, setItems] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [taskId, setTaskId] = useState("");
  const [minutes, setMinutes] = useState(25);
  const [now, setNow] = useState(0);
  const [finishTask, setFinishTask] = useState(false);
  const active = items.find(s => s.status === "running" || s.status === "paused");
  const remaining = active ? Math.max(0, active.durationSeconds - elapsed(active, now)) : 0;

  const read = useCallback(async () => {
    try {
      const r = await authFetch("/api/focus", { cache: "no-store" });
      if (r.status === 401) { onUnauthorized(); return; }
      if (!r.ok) throw new Error("Could not load focus sessions.");
      const result = await r.json(); setItems(result.items);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load focus sessions."); }
    finally { setLoading(false); }
  }, [onUnauthorized]);
  useEffect(() => { const timer = setTimeout(() => void read(), 0); return () => clearTimeout(timer); }, [read]);
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);

  const call = async (method: string, body: object) => {
    const r = await authFetch("/api/focus", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 401) { onUnauthorized(); throw new Error("Please sign in again."); }
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "Focus session could not be updated.");
    return result;
  };
  const start = async () => {
    setBusy(true); setError("");
    try {
      const result = await call("POST", { minutes, taskId: taskId || null, label: note });
      setItems(prev => [result.item, ...prev]); setNow(Date.now());
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const change = async (session: Session, action: "pause" | "resume" | "finish" | "discard") => {
    setBusy(true); setError("");
    try {
      const result = await call("PATCH", { id: session.id, action });
      setItems(prev => prev.map(s => s.id === session.id ? result.item : s)); setNow(Date.now());
      if (action === "finish" && finishTask && session.taskId && !tasks.find(t => t.id === session.taskId)?.completed) {
        try { await onTaskComplete(session.taskId); }
        catch { setError("Focus time was saved, but the linked task could not be marked complete."); }
      }
      if (action === "finish" || action === "discard") { setFinishTask(false); setTaskId(""); setNote(""); }
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (session: Session) => {
    if (!confirm("Remove this focus session from your history?")) return;
    const old = items; setItems(prev => prev.filter(s => s.id !== session.id)); setError("");
    try { await call("DELETE", { id: session.id }); } catch(e) { setItems(old); setError((e as Error).message); }
  };
  const completed = items.filter(s => s.status === "finished");
  const today = new Date().toDateString();
  const todayItems = completed.filter(s => new Date(s.finishedAt || s.startedAt).toDateString() === today);
  const todayMinutes = Math.round(todayItems.reduce((sum, s) => sum + s.elapsedSeconds, 0) / 60);
  const weekDays = Array.from({length: 7}, (_, index) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - (6-index)); return d; });
  const weekCounts = weekDays.map(day => completed.filter(s => new Date(s.finishedAt || s.startedAt).toDateString() === day.toDateString()).reduce((sum,s) => sum + s.elapsedSeconds,0));
  const maxDay = Math.max(1, ...weekCounts);

  return <div className="focus-studio">
    <div className="focus-intro"><div><div className="focus-kicker"><Sparkles size={14}/> A QUIETER WAY TO MAKE PROGRESS</div><h2>Make space for what matters.</h2><p>Choose one thing. Give it your attention. Let the small sessions add up.</p></div><div className="focus-intro-icon"><Timer size={50}/></div></div>
    {error && <div className="page-error">{error}<button onClick={() => setError("")}>×</button></div>}
    <div className="focus-layout"><section className="panel focus-timer-panel"><div className="panel-kicker">YOUR FOCUS SPACE</div><h3>{active ? active.label : "Ready when you are"}</h3><p>{active ? active.status === "paused" ? "Paused. Pick up whenever you’re ready." : "One thing at a time. You’ve got this." : "A little dedicated time can change your whole day."}</p>
      {loading ? <div className="focus-loading"><Loader2 size={21} className="spin"/> Loading your focus space...</div> : <>
      <div className={`focus-clock ${active?.status === "running" ? "running" : ""}`} style={{ "--focus-progress": `${active ? Math.min(100, (elapsed(active,now)/active.durationSeconds)*100) : 0}%` } as CSSProperties}><div className="focus-clock-inner"><span>{active?.status === "running" ? "FOCUSING" : active?.status === "paused" ? "PAUSED" : "FOCUS TIMER"}</span><strong>{clock(active ? remaining : minutes*60)}</strong><small>{active ? `${Math.round(elapsed(active,now)/60)} of ${Math.round(active.durationSeconds/60)} minutes` : "Your time starts here"}</small></div></div>
      {active ? <><div className="focus-controls"><button disabled={busy} className="btn btn-outline" onClick={() => change(active, active.status === "running" ? "pause" : "resume")}>{active.status === "running" ? <Pause size={17}/> : <Play size={17}/>} {active.status === "running" ? "Pause" : "Resume"}</button><button disabled={busy} className="btn btn-primary" onClick={() => change(active,"finish")}>{busy ? <Loader2 size={16} className="spin"/> : <Check size={17}/>} Finish & save</button></div><label className="focus-check"><input type="checkbox" checked={finishTask} disabled={!active.taskId || !!tasks.find(t=>t.id===active.taskId)?.completed} onChange={e=>setFinishTask(e.target.checked)}/> Mark linked task complete when I finish</label><button className="focus-discard" disabled={busy} onClick={() => { if (confirm("Discard this focus session? It will not count toward your progress.")) void change(active,"discard"); }}><Square size={13}/> Discard session</button></> : <div className="focus-form"><label>What are you working on?<select value={taskId} onChange={e => { setTaskId(e.target.value); if (e.target.value) setNote(""); }}><option value="">Just focusing (no task)</option>{tasks.filter(t=>!t.completed).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label><label>Session name <span>(optional)</span><input value={note} onChange={e=>setNote(e.target.value)} maxLength={120} placeholder={taskId ? "Uses your task name by default" : "e.g. Read chapter two"}/></label><label>Duration<div className="focus-durations">{[15,25,45,60].map(value=><button key={value} type="button" className={minutes===value?"selected":""} onClick={()=>setMinutes(value)}>{value}m</button>)}<input aria-label="Custom minutes" type="number" min={1} max={120} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></div></label><button className="btn btn-primary focus-start" disabled={busy || !Number.isInteger(minutes) || minutes < 1 || minutes > 120} onClick={start}>{busy ? <Loader2 size={17} className="spin"/> : <Play size={17}/>} Start focusing</button></div>}
      </>}
    </section><div className="focus-side"><section className="panel focus-stat-panel"><div className="panel-kicker">YOUR MOMENTUM</div><h3>Progress, not perfection.</h3><div className="focus-stat-row"><div><Clock3 size={19}/><strong>{todayMinutes}m</strong><span>focused today</span></div><div><Target size={19}/><strong>{todayItems.length}</strong><span>sessions today</span></div><div><TrendingUp size={19}/><strong>{completed.length}</strong><span>all-time sessions</span></div></div><div className="focus-chart-title">LAST 7 DAYS <span>{Math.round(weekCounts.reduce((a,b)=>a+b,0)/60)} minutes total</span></div><div className="focus-chart">{weekDays.map((day,index)=><div key={day.toISOString()} className="focus-chart-day" title={`${Math.round(weekCounts[index]/60)} minutes`}><div className="focus-chart-track"><div style={{height:`${weekCounts[index] ? Math.max(9,weekCounts[index]/maxDay*100) : 3}%`}}/></div><small>{day.toLocaleDateString("en-US",{weekday:"narrow"})}</small></div>)}</div></section><section className="focus-note-card"><div>✦</div><h3>Small starts count.</h3><p>You don’t need a perfect day. Just one focused moment on something that matters to you.</p></section></div></div>
    <section className="panel focus-history"><div className="panel-head"><div><div className="panel-kicker">LOOK HOW FAR YOU’VE COME</div><h3>Session history</h3></div><span className="count-badge">{completed.length}</span></div>{completed.length ? completed.slice(0,20).map(s=><div className="focus-history-row" key={s.id}><div className="focus-history-icon"><Check size={18}/></div><div><b>{s.label}</b><small>{new Date(s.finishedAt || s.startedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} · {s.taskId ? "Linked to a task" : "Personal focus"}</small></div><span>{Math.max(1,Math.round(s.elapsedSeconds/60))} min</span><button title="Delete session" onClick={()=>remove(s)}><Trash2 size={16}/></button></div>) : <div className="focus-empty"><RotateCcw size={23}/><b>Your focus story starts here</b><p>Complete a session and you’ll see your progress here.</p></div>}</section>
  </div>;
}
