"use client";
import { useCallback, useEffect, useState } from "react";
import { Heart, ArrowRight, Loader2, Trash2, Sparkles } from "lucide-react";
import { authFetch } from "@/lib/client-auth";

type Checkin = { id: string; day: string; mood: string; note: string; reflection: string };
const moods = [{ name: "Great", icon: "☀️" }, { name: "Good", icon: "🙂" }, { name: "Okay", icon: "😐" }, { name: "Low", icon: "🌧️" }, { name: "Stressed", icon: "😣" }];
export default function DailyCheckin({ onUnauthorized, onSaved }: { onUnauthorized: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<Checkin[]>([]);
  const [mood, setMood] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const day = new Date().toISOString().slice(0,10);
  const verifySession = useCallback(async () => {
    try {
      const response = await authFetch("/api/auth", { cache: "no-store" });
      if (response.ok && !(await response.json()).user) { onUnauthorized(); return true; }
    } catch { /* A temporary network error does not prove the session expired. */ }
    setError("Check-ins are temporarily unavailable. Please try again in a moment.");
    return false;
  }, [onUnauthorized]);
  useEffect(() => {
    authFetch("/api/checkins", { cache: "no-store" }).then(async r => {
      if (r.status === 401) { await verifySession(); return; }
      if (!r.ok) throw new Error("Could not load check-ins.");
      const data = await r.json(); setItems(data.items);
      const current = (data.items as Checkin[]).find(i => i.day === day);
      if (current) { setMood(current.mood); setNote(current.note); }
    }).catch(() => setError("Could not load check-ins. Try refreshing the page.")).finally(() => setLoading(false));
  }, [day, verifySession]);
  const save = async () => {
    if (!mood || busy) return;
    setBusy(true); setError(""); setWarning("");
    try {
      const r = await authFetch("/api/checkins", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mood, note }) });
      if (r.status === 401) { await verifySession(); return; }
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not save check-in.");
      setItems(prev => [data.item, ...prev.filter(i => i.id !== data.item.id)].slice(0,14));
      if (data.warning) setWarning(`Check-in saved, but live AI was unavailable: ${data.warning}`);
      onSaved();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not save check-in."); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this check-in?")) return;
    const previous = items; setItems(items.filter(i => i.id !== id));
    try {
      const r = await authFetch("/api/checkins", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (r.status === 401) { await verifySession(); return; }
      if (!r.ok) throw new Error("Could not remove check-in.");
      if (previous.find(i => i.id === id)?.day === day) { setMood(""); setNote(""); }
    } catch(e) { setItems(previous); setError(e instanceof Error ? e.message : "Could not remove check-in."); }
  };
  const current = items.find(i => i.day === day);
  return <section className="panel checkin-panel">
    <div className="panel-head"><div><div className="panel-kicker">A MOMENT FOR YOU</div><h3>Daily check-in <span className="heading-emoji">💛</span></h3></div><div className="checkin-icon"><Heart size={18}/></div></div>
    {loading ? <div className="checkin-loading"><Loader2 size={18} className="spin"/> Loading your check-ins...</div> : <>
      <p className="checkin-question">How are you feeling today?</p>
      <div className="mood-options">{moods.map(option => <button type="button" key={option.name} className={mood === option.name ? "selected" : ""} onClick={() => setMood(option.name)} aria-label={`Feeling ${option.name}`} title={option.name}><span>{option.icon}</span><small>{option.name}</small></button>)}</div>
      <textarea className="checkin-note" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="What’s on your mind? (optional)" aria-label="Daily check-in note"/>
      <button className="btn btn-primary checkin-submit" onClick={save} disabled={!mood || busy}>{busy ? <Loader2 size={15} className="spin"/> : <Sparkles size={15}/>} {busy ? "Reflecting..." : current ? "Update check-in" : "Save & reflect"} {!busy && <ArrowRight size={14}/>}</button>
      {error && <p className="checkin-error">{error}</p>}{warning && <p className="checkin-error">{warning}</p>}
      {current && <div className="checkin-reflection"><div><Sparkles size={14}/> A thought for today</div><p>{current.reflection}</p></div>}
      {items.filter(i=>i.day !== day).length > 0 && <div className="checkin-history"><b>Recent moments</b>{items.filter(i=>i.day !== day).slice(0,3).map(i => <div key={i.id}><span>{moods.find(m=>m.name===i.mood)?.icon} {new Date(i.day + "T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})} · {i.mood}</span><button onClick={() => remove(i.id)} title="Remove check-in" aria-label="Remove check-in"><Trash2 size={13}/></button></div>)}</div>}
      {current && <button className="checkin-remove" onClick={() => remove(current.id)}>Remove today’s check-in</button>}
    </>}
  </section>;
}
